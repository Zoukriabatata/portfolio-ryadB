//! IPC surface for the NinjaTrader bridge.
//!
//! Three commands keyed on `BridgeState`:
//!   * `bridge_connect`    — start the adapter + engine pump + state emitter
//!   * `bridge_disconnect` — stop them
//!   * `bridge_status`     — current connection status
//!
//! Idempotent: a second `bridge_connect` while already connected is a
//! no-op; the caller can re-issue it without forcing a reconnect.
//! Force-reconnect goes through `bridge_disconnect` first.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::bridge_events;
use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::bridge::{BridgeAdapter, BridgeConfig};
use crate::state::BridgeState;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeConnectArgs {
    /// Optional host override. Default: "127.0.0.1".
    pub host: Option<String>,
    /// Optional port override. Default: 7272.
    pub port: Option<u16>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
}

/// Open the TCP connection to NinjaTrader's `OrderflowBridge` indicator,
/// start the engine pump, and spawn the state emitter.
#[tauri::command]
pub async fn bridge_connect(
    state: State<'_, BridgeState>,
    app: AppHandle,
    args: BridgeConnectArgs,
) -> Result<BridgeStatus, String> {
    // Idempotent — already connected? return status.
    if state.adapter.lock().await.is_some() {
        return bridge_status(state).await;
    }

    let host = args.host.unwrap_or_else(|| "127.0.0.1".to_string());
    let port = args.port.unwrap_or(7272);
    let config = BridgeConfig {
        host: host.clone(),
        port,
    };

    let mut adapter = BridgeAdapter::with_config(config, state.engine.clone());

    // Subscribe to state updates BEFORE connect — the first
    // BridgeConnState::Connecting is sent immediately by the reader.
    let state_rx = adapter.states();

    adapter.connect().await.map_err(err)?;

    // Pump ticks into the shared Rithmic-side FootprintEngine. Same
    // engine = same `footprint-update` events for the frontend, same
    // SQLite cache writer. The bridge becomes a drop-in source for
    // anyone listening to the existing event.
    let pump = state.engine.clone().spawn(adapter.ticks());
    let state_emit = bridge_events::spawn_state_emitter(app, state_rx);

    *state.engine_pump.lock().await = Some(pump);
    *state.state_emit.lock().await = Some(state_emit);
    *state.adapter.lock().await = Some(adapter);

    tracing::info!(host = %host, port, "Bridge: connected");

    Ok(BridgeStatus {
        connected: true,
        host,
        port,
    })
}

/// Disconnect, stop the pump and the state emitter. Safe to call when
/// already disconnected (returns idle status).
#[tauri::command]
pub async fn bridge_disconnect(state: State<'_, BridgeState>) -> Result<BridgeStatus, String> {
    if let Some(mut adapter) = state.adapter.lock().await.take() {
        adapter.disconnect().await.map_err(err)?;
    }
    if let Some(handle) = state.engine_pump.lock().await.take() {
        handle.abort();
    }
    if let Some(handle) = state.state_emit.lock().await.take() {
        handle.abort();
    }

    tracing::info!("Bridge: disconnected");

    Ok(BridgeStatus {
        connected: false,
        host: "127.0.0.1".to_string(),
        port: 7272,
    })
}

#[tauri::command]
pub async fn bridge_status(state: State<'_, BridgeState>) -> Result<BridgeStatus, String> {
    let guard = state.adapter.lock().await;
    let (host, port, connected) = match guard.as_ref() {
        Some(a) => (a.config().host.clone(), a.config().port, true),
        None => ("127.0.0.1".to_string(), 7272, false),
    };
    Ok(BridgeStatus {
        connected,
        host,
        port,
    })
}
