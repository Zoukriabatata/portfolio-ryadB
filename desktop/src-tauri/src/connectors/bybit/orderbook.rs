//! Phase B / M3.5 — Bybit V5 linear order-book subscriber.
//!
//! Connects directly to wss://stream.bybit.com/v5/public/linear,
//! subscribes to `orderbook.500.{symbol}`, applies snapshot + delta
//! frames into an `OrderbookEngine`, and emits a throttled
//! `orderbook-update` Tauri event at ≤30 Hz so the React side can
//! render without being flooded.
//!
//! Auto-resync: a sequence rewind / decode error resets the engine
//! and re-sends the SUBSCRIBE message — Bybit replays the snapshot
//! within a few hundred ms.
//!
//! Multi-symbol: each call to `spawn(...)` produces an independent
//! tokio task with its own WebSocket. The parent owns a shutdown
//! sender per symbol so it can stop them individually.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::engine::{OrderbookEngine, OrderbookUpdate};

const URL: &str = "wss://stream.bybit.com/v5/public/linear";
// Bybit V5 linear public WS supports depths 1, 50, 200. The
// `orderbook.500.SYMBOL` topic returns "handler not found" — that
// depth is REST-only. 200 levels is plenty for a liquidity heatmap.
const DEPTH: u32 = 200;
const EMIT_INTERVAL: Duration = Duration::from_millis(33); // ≈30 Hz
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);
const ORDERBOOK_EVENT: &str = "orderbook-update";

pub struct OrderbookSubscriberHandle {
    pub join: JoinHandle<()>,
    pub shutdown: oneshot::Sender<()>,
}

/// Spawn an orderbook subscriber task. The returned handle's
/// `shutdown` channel can be fired to stop the subscriber and have
/// the WS torn down cleanly. `symbol` should be upper-case Bybit
/// ticker (e.g. "BTCUSDT").
pub fn spawn(symbol: String, app: AppHandle) -> OrderbookSubscriberHandle {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let join = tokio::spawn(run_subscriber(symbol, app, shutdown_rx));
    OrderbookSubscriberHandle {
        join,
        shutdown: shutdown_tx,
    }
}

async fn run_subscriber(
    symbol: String,
    app: AppHandle,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let mut engine = OrderbookEngine::new(symbol.clone(), DEPTH);
    let topic = format!("orderbook.{}.{}", DEPTH, symbol);
    let sub_msg = json!({ "op": "subscribe", "args": [topic] }).to_string();
    let ping_msg = json!({ "op": "ping" }).to_string();

    let (ws, _) = match connect_async(URL).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("[bybit-ob {}] connect failed: {}", symbol, e);
            return;
        }
    };
    let (mut sink, mut stream) = ws.split();

    if let Err(e) = sink.send(Message::Text(sub_msg.clone())).await {
        tracing::warn!("[bybit-ob {}] subscribe failed: {}", symbol, e);
        return;
    }
    tracing::info!("[bybit-ob {}] subscribed to {}", symbol, topic);

    let mut emit_ticker = tokio::time::interval(EMIT_INTERVAL);
    emit_ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    emit_ticker.tick().await; // consume the immediate tick

    let mut heartbeat_ticker = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat_ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    heartbeat_ticker.tick().await;

    let mut dirty = false;

    loop {
        tokio::select! {
            biased;
            _ = &mut shutdown_rx => {
                tracing::info!("[bybit-ob {}] shutdown received", symbol);
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        match handle_frame(&text, &mut engine) {
                            Ok(true) => dirty = true,
                            Ok(false) => {}
                            Err(e) => {
                                tracing::warn!(
                                    "[bybit-ob {}] frame error → resync: {}",
                                    symbol, e
                                );
                                engine.reset();
                                if let Err(e) = sink.send(Message::Text(sub_msg.clone())).await {
                                    tracing::warn!(
                                        "[bybit-ob {}] resync subscribe failed: {}",
                                        symbol, e
                                    );
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if let Err(e) = sink.send(Message::Pong(payload)).await {
                            tracing::warn!("[bybit-ob {}] pong failed: {}", symbol, e);
                            break;
                        }
                    }
                    Some(Ok(Message::Close(c))) => {
                        tracing::info!("[bybit-ob {}] server closed: {:?}", symbol, c);
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        tracing::warn!("[bybit-ob {}] WS error: {}", symbol, e);
                        break;
                    }
                    None => {
                        tracing::warn!("[bybit-ob {}] stream ended", symbol);
                        break;
                    }
                }
            }
            _ = emit_ticker.tick() => {
                if dirty && engine.snapshot_received() {
                    let event: OrderbookUpdate = engine.snapshot_event("BYBIT");
                    if let Err(e) = app.emit(ORDERBOOK_EVENT, &event) {
                        tracing::warn!("[bybit-ob {}] emit failed: {}", symbol, e);
                    }
                    dirty = false;
                }
            }
            _ = heartbeat_ticker.tick() => {
                if let Err(e) = sink.send(Message::Text(ping_msg.clone())).await {
                    tracing::warn!("[bybit-ob {}] ping failed: {}", symbol, e);
                    break;
                }
            }
        }
    }

    let _ = sink.close().await;
    tracing::info!("[bybit-ob {}] subscriber exited", symbol);
}

/// Returns `Ok(true)` when the frame mutated the engine,
/// `Ok(false)` for ack/pong/unrelated payloads, and `Err(...)` when
/// the engine state is now inconsistent and needs a reset.
fn handle_frame(text: &str, engine: &mut OrderbookEngine) -> Result<bool, String> {
    let v: serde_json::Value =
        serde_json::from_str(text).map_err(|e| e.to_string())?;
    let topic = v.get("topic").and_then(|t| t.as_str()).unwrap_or("");
    if !topic.starts_with("orderbook.") {
        // Subscription confirmation, pong reply, etc.
        return Ok(false);
    }

    let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let data = v.get("data").ok_or("missing data")?;

    let bids = parse_levels(data.get("b").ok_or("missing b")?)?;
    let asks = parse_levels(data.get("a").ok_or("missing a")?)?;
    let seq = data
        .get("seq")
        .or_else(|| data.get("u"))
        .and_then(|s| s.as_u64())
        .ok_or("missing seq/u")?;

    match typ {
        "snapshot" => {
            engine.apply_snapshot(bids, asks, seq);
            Ok(true)
        }
        "delta" => {
            engine.apply_delta(bids, asks, seq)?;
            Ok(true)
        }
        other => Err(format!("unknown type: {}", other)),
    }
}

fn parse_levels(v: &serde_json::Value) -> Result<Vec<(f64, f64)>, String> {
    let arr = v.as_array().ok_or("level field not an array")?;
    let mut out = Vec::with_capacity(arr.len());
    for lvl in arr {
        let pair = lvl.as_array().ok_or("level not array")?;
        let price: f64 = pair
            .first()
            .and_then(|p| p.as_str())
            .ok_or("price missing")?
            .parse()
            .map_err(|e: std::num::ParseFloatError| e.to_string())?;
        let qty: f64 = pair
            .get(1)
            .and_then(|q| q.as_str())
            .ok_or("qty missing")?
            .parse()
            .map_err(|e: std::num::ParseFloatError| e.to_string())?;
        out.push((price, qty));
    }
    Ok(out)
}
