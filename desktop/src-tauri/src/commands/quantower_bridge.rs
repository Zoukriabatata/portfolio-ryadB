//! IPC surface for the Quantower bridge.
//!
//! Mirror of bridge.rs — identical logic, port 7273, "quantower-*" state.
//! Three commands:
//!   * `quantower_connect`    — start adapter + engine pump + state emitter
//!   * `quantower_disconnect` — stop them
//!   * `quantower_status`     — current connection status

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::quantower_bridge_depth::{self, QuantowerDepthState};
use crate::commands::quantower_bridge_events;
use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::bridge::{BridgeAdapter, BridgeConfig};
use crate::state::QuantowerState;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantowerConnectArgs {
    pub host: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuantowerStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
}

#[tauri::command]
pub async fn quantower_connect(
    state: State<'_, QuantowerState>,
    depth_state: State<'_, Arc<QuantowerDepthState>>,
    app: AppHandle,
    args: QuantowerConnectArgs,
) -> Result<QuantowerStatus, String> {
    if state.adapter.lock().await.is_some() {
        return quantower_status(state).await;
    }

    let host = {
        let h = args.host.unwrap_or_else(|| "127.0.0.1".to_string());
        if h != "127.0.0.1" && h != "localhost" && h != "::1" {
            return Err("quantower host must be a loopback address".to_string());
        }
        h
    };
    let port = args.port.unwrap_or(7273);
    let config = BridgeConfig {
        host: host.clone(),
        port,
    };

    let mut adapter = BridgeAdapter::with_config(config, state.engine.clone());

    let state_rx = adapter.states();
    let depth_rx = adapter.depths();

    adapter.connect().await.map_err(err)?;

    let pump       = state.engine.clone().spawn(adapter.ticks());
    let state_emit = quantower_bridge_events::spawn_state_emitter(app, state_rx);
    let depth_pump = quantower_bridge_depth::spawn_pump(depth_rx, depth_state.inner().clone());

    *state.engine_pump.lock().await = Some(pump);
    *state.state_emit.lock().await  = Some(state_emit);
    *state.depth_pump.lock().await  = Some(depth_pump);
    *state.adapter.lock().await     = Some(adapter);

    tracing::info!(host = %host, port, "Quantower bridge: connected");

    Ok(QuantowerStatus { connected: true, host, port })
}

#[tauri::command]
pub async fn quantower_disconnect(
    state: State<'_, QuantowerState>,
) -> Result<QuantowerStatus, String> {
    if let Some(mut adapter) = state.adapter.lock().await.take() {
        adapter.disconnect().await.map_err(err)?;
    }
    if let Some(h) = state.engine_pump.lock().await.take() { h.abort(); }
    if let Some(h) = state.state_emit.lock().await.take()  { h.abort(); }
    if let Some(h) = state.depth_pump.lock().await.take()  { h.abort(); }

    tracing::info!("Quantower bridge: disconnected");

    Ok(QuantowerStatus {
        connected: false,
        host: "127.0.0.1".to_string(),
        port: 7273,
    })
}

#[tauri::command]
pub async fn quantower_status(
    state: State<'_, QuantowerState>,
) -> Result<QuantowerStatus, String> {
    let guard = state.adapter.lock().await;
    let (host, port, connected) = match guard.as_ref() {
        Some(a) => (a.config().host.clone(), a.config().port, true),
        None    => ("127.0.0.1".to_string(), 7273, false),
    };
    Ok(QuantowerStatus { connected, host, port })
}
