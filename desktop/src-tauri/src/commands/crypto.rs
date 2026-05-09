//! Phase B / M2 — IPC surface for the public crypto adapters
//! (Binance / Bybit / Deribit).
//!
//! All three commands dispatch on `exchange` (`"binance" | "bybit" |
//! "deribit"`) and operate on the shared `CryptoState`. The structure
//! mirrors `commands::rithmic` minus the auth flow — public feeds
//! don't have a `login()` step.

use serde::{Deserialize, Serialize};
use tauri::State;

use tauri::AppHandle;

use crate::commands::crypto_tick_events;
use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::binance::BinanceAdapter;
use crate::connectors::bybit::orderbook::{self as bybit_orderbook};
use crate::connectors::bybit::BybitAdapter;
use crate::connectors::deribit::DeribitAdapter;
use crate::state::CryptoState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoConnectArgs {
    /// `"binance" | "bybit" | "deribit"`.
    pub exchange: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoSubscribeArgs {
    pub exchange: String,
    /// For Binance/Bybit a ticker (e.g. `"BTCUSDT"`). For Deribit a
    /// full instrument name (e.g. `"BTC-PERPETUAL"`).
    pub symbol: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CryptoStatus {
    pub binance_connected: bool,
    pub bybit_connected: bool,
    pub deribit_connected: bool,
    pub binance_subscriptions: Vec<String>,
    pub bybit_subscriptions: Vec<String>,
    pub deribit_subscriptions: Vec<String>,
    /// M3.5 — active Bybit orderbook subscriptions (upper-case
    /// symbols). Independent from the trade-stream
    /// `bybit_subscriptions` because the heatmap and footprint can
    /// run on different pairs simultaneously.
    pub bybit_orderbook_subscriptions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoOrderbookArgs {
    /// Currently only "bybit" — Binance/Deribit orderbooks land in
    /// later milestones if the heatmap demands them.
    pub exchange: String,
    pub symbol: String,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Open the WebSocket for `exchange` and start the engine pump.
/// Idempotent: a second call with the same exchange tears the
/// previous adapter down before opening a fresh one.
///
/// `app` is the Tauri AppHandle the framework injects on every
/// command; passed through to the per-adapter connect helpers so
/// the M6b-1 tick emitter can `app.emit("crypto-tick-update", ...)`
/// without holding a global handle.
#[tauri::command]
pub async fn crypto_connect(
    state: State<'_, CryptoState>,
    app: AppHandle,
    args: CryptoConnectArgs,
) -> Result<CryptoStatus, String> {
    match args.exchange.as_str() {
        "binance" => connect_binance(&state).await?,
        "bybit" => connect_bybit(&state, &app).await?,
        "deribit" => connect_deribit(&state).await?,
        other => return Err(format!("unknown exchange: {}", other)),
    }
    crypto_status(state).await
}

async fn connect_binance(state: &CryptoState) -> Result<(), String> {
    disconnect_binance_inner(state).await;
    let mut adapter = BinanceAdapter::new();
    adapter.connect().await.map_err(err)?;
    let pump = state.engine.clone().spawn(adapter.ticks());
    *state.binance_pump.lock().await = Some(pump);
    *state.binance.lock().await = Some(adapter);
    Ok(())
}

async fn connect_bybit(state: &CryptoState, app: &AppHandle) -> Result<(), String> {
    disconnect_bybit_inner(state).await;
    let mut adapter = BybitAdapter::new();
    adapter.connect().await.map_err(err)?;
    // Two independent broadcast receivers from the same Sender:
    // one feeds the FootprintEngine (existing M2 path), the other
    // feeds the per-tick Tauri emitter for the heatmap bubbles
    // (M6b-1). Neither blocks the other.
    let pump = state.engine.clone().spawn(adapter.ticks());
    let tick_emit = crypto_tick_events::spawn_emitter(app.clone(), adapter.ticks());
    *state.bybit_pump.lock().await = Some(pump);
    *state.bybit_tick_emit.lock().await = Some(tick_emit);
    *state.bybit.lock().await = Some(adapter);
    Ok(())
}

async fn connect_deribit(state: &CryptoState) -> Result<(), String> {
    disconnect_deribit_inner(state).await;
    let mut adapter = DeribitAdapter::new();
    adapter.connect().await.map_err(err)?;
    let pump = state.engine.clone().spawn(adapter.ticks());
    *state.deribit_pump.lock().await = Some(pump);
    *state.deribit.lock().await = Some(adapter);
    Ok(())
}

#[tauri::command]
pub async fn crypto_subscribe(
    state: State<'_, CryptoState>,
    args: CryptoSubscribeArgs,
) -> Result<CryptoStatus, String> {
    match args.exchange.as_str() {
        "binance" => {
            let mut guard = state.binance.lock().await;
            let adapter = guard
                .as_mut()
                .ok_or_else(|| "binance not connected".to_string())?;
            adapter.subscribe(&args.symbol, "binance").await.map_err(err)?;
        }
        "bybit" => {
            let mut guard = state.bybit.lock().await;
            let adapter = guard
                .as_mut()
                .ok_or_else(|| "bybit not connected".to_string())?;
            adapter.subscribe(&args.symbol, "bybit").await.map_err(err)?;
        }
        "deribit" => {
            let mut guard = state.deribit.lock().await;
            let adapter = guard
                .as_mut()
                .ok_or_else(|| "deribit not connected".to_string())?;
            adapter.subscribe(&args.symbol, "deribit").await.map_err(err)?;
        }
        other => return Err(format!("unknown exchange: {}", other)),
    }
    crypto_status(state).await
}

#[tauri::command]
pub async fn crypto_unsubscribe(
    state: State<'_, CryptoState>,
    args: CryptoSubscribeArgs,
) -> Result<CryptoStatus, String> {
    match args.exchange.as_str() {
        "binance" => {
            let mut guard = state.binance.lock().await;
            if let Some(adapter) = guard.as_mut() {
                adapter
                    .unsubscribe(&args.symbol, "binance")
                    .await
                    .map_err(err)?;
            }
        }
        "bybit" => {
            let mut guard = state.bybit.lock().await;
            if let Some(adapter) = guard.as_mut() {
                adapter
                    .unsubscribe(&args.symbol, "bybit")
                    .await
                    .map_err(err)?;
            }
        }
        "deribit" => {
            let mut guard = state.deribit.lock().await;
            if let Some(adapter) = guard.as_mut() {
                adapter
                    .unsubscribe(&args.symbol, "deribit")
                    .await
                    .map_err(err)?;
            }
        }
        other => return Err(format!("unknown exchange: {}", other)),
    }
    crypto_status(state).await
}

#[tauri::command]
pub async fn crypto_disconnect(
    state: State<'_, CryptoState>,
    args: CryptoConnectArgs,
) -> Result<CryptoStatus, String> {
    match args.exchange.as_str() {
        "binance" => disconnect_binance_inner(&state).await,
        "bybit" => disconnect_bybit_inner(&state).await,
        "deribit" => disconnect_deribit_inner(&state).await,
        other => return Err(format!("unknown exchange: {}", other)),
    }
    crypto_status(state).await
}

#[tauri::command]
pub async fn crypto_status(state: State<'_, CryptoState>) -> Result<CryptoStatus, String> {
    let mut status = CryptoStatus::default();
    if let Some(a) = state.binance.lock().await.as_ref() {
        status.binance_connected = true;
        status.binance_subscriptions = a.subscriptions().iter().cloned().collect();
    }
    if let Some(a) = state.bybit.lock().await.as_ref() {
        status.bybit_connected = true;
        status.bybit_subscriptions = a.subscriptions().iter().cloned().collect();
    }
    if let Some(a) = state.deribit.lock().await.as_ref() {
        status.deribit_connected = true;
        status.deribit_subscriptions = a.subscriptions().iter().cloned().collect();
    }
    {
        let books = state.bybit_orderbooks.lock().await;
        let mut subs: Vec<String> = books.keys().cloned().collect();
        subs.sort();
        status.bybit_orderbook_subscriptions = subs;
    }
    Ok(status)
}

/// M3.5 — open a Bybit linear orderbook subscriber for `symbol`
/// (upper-case ticker, e.g. "BTCUSDT"). Idempotent: a second call
/// for the same symbol is a no-op (returns the current status).
#[tauri::command]
pub async fn crypto_orderbook_subscribe(
    state: State<'_, CryptoState>,
    app: AppHandle,
    args: CryptoOrderbookArgs,
) -> Result<CryptoStatus, String> {
    if args.exchange != "bybit" {
        return Err(format!(
            "orderbook only supports bybit for now, got {}",
            args.exchange
        ));
    }
    let symbol = args.symbol.to_uppercase();
    {
        let books = state.bybit_orderbooks.lock().await;
        if books.contains_key(&symbol) {
            // Caller will see the existing subscription in status —
            // no point in spawning a duplicate task.
            drop(books);
            return crypto_status(state).await;
        }
    }
    let handle = bybit_orderbook::spawn(symbol.clone(), app);
    state
        .bybit_orderbooks
        .lock()
        .await
        .insert(symbol, handle);
    crypto_status(state).await
}

#[tauri::command]
pub async fn crypto_orderbook_unsubscribe(
    state: State<'_, CryptoState>,
    args: CryptoOrderbookArgs,
) -> Result<CryptoStatus, String> {
    if args.exchange != "bybit" {
        return Err(format!(
            "orderbook only supports bybit for now, got {}",
            args.exchange
        ));
    }
    let symbol = args.symbol.to_uppercase();
    if let Some(handle) = state.bybit_orderbooks.lock().await.remove(&symbol) {
        let _ = handle.shutdown.send(());
        // Best-effort wait: if the task doesn't exit within 1 s,
        // just abort it. The WS goes away when the task drops.
        match tokio::time::timeout(std::time::Duration::from_secs(1), handle.join).await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => tracing::warn!(
                "orderbook task for {} panicked on shutdown: {}",
                symbol, e
            ),
            Err(_) => tracing::warn!(
                "orderbook task for {} did not exit in 1s — already torn down",
                symbol
            ),
        }
    }
    crypto_status(state).await
}

async fn disconnect_binance_inner(state: &CryptoState) {
    if let Some(mut adapter) = state.binance.lock().await.take() {
        if let Err(e) = adapter.disconnect().await {
            tracing::warn!("binance disconnect failed: {}", e);
        }
    }
    if let Some(handle) = state.binance_pump.lock().await.take() {
        handle.abort();
    }
}

async fn disconnect_bybit_inner(state: &CryptoState) {
    if let Some(mut adapter) = state.bybit.lock().await.take() {
        if let Err(e) = adapter.disconnect().await {
            tracing::warn!("bybit disconnect failed: {}", e);
        }
    }
    if let Some(handle) = state.bybit_pump.lock().await.take() {
        handle.abort();
    }
    if let Some(handle) = state.bybit_tick_emit.lock().await.take() {
        handle.abort();
    }
}

async fn disconnect_deribit_inner(state: &CryptoState) {
    if let Some(mut adapter) = state.deribit.lock().await.take() {
        if let Err(e) = adapter.disconnect().await {
            tracing::warn!("deribit disconnect failed: {}", e);
        }
    }
    if let Some(handle) = state.deribit_pump.lock().await.take() {
        handle.abort();
    }
}
