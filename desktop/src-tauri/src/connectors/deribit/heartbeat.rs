//! Deribit heartbeat — JSON-RPC `public/test` every 30s.
//!
//! Deribit terminates idle WebSockets after ~60s. `public/test` is
//! cheap (no params, returns `{"version": "..."}`), so it doubles as
//! both a keep-alive and a connectivity probe.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::SinkExt;
use serde_json::json;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::deribit::client::SharedSink;

pub const DEFAULT_INTERVAL: Duration = Duration::from_secs(30);

pub struct HeartbeatHandle {
    pub handle: JoinHandle<()>,
    pub shutdown: oneshot::Sender<()>,
}

pub fn spawn(
    sink: SharedSink,
    interval: Duration,
    next_id: Arc<AtomicU64>,
) -> HeartbeatHandle {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let handle = tokio::spawn(heartbeat_task(sink, interval, shutdown_rx, next_id));
    HeartbeatHandle {
        handle,
        shutdown: shutdown_tx,
    }
}

async fn heartbeat_task(
    sink: SharedSink,
    interval: Duration,
    mut shutdown_rx: oneshot::Receiver<()>,
    next_id: Arc<AtomicU64>,
) {
    tracing::info!("Deribit heartbeat started, interval={:?}", interval);

    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ticker.tick().await; // consume immediate tick

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Deribit heartbeat: shutdown received");
                break;
            }
            _ = ticker.tick() => {
                let id = next_id.fetch_add(1, Ordering::SeqCst);
                let req = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "method": "public/test",
                    "params": {},
                });
                let payload = match serde_json::to_string(&req) {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!("Deribit heartbeat encode failed: {}", e);
                        continue;
                    }
                };
                let mut s = sink.lock().await;
                if let Err(e) = s.send(Message::Text(payload)).await {
                    tracing::warn!("Deribit heartbeat send failed: {}", e);
                    break;
                }
                tracing::trace!("Deribit public/test sent");
            }
        }
    }

    tracing::info!("Deribit heartbeat exited");
}
