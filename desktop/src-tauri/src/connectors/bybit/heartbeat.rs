//! Bybit heartbeat task — sends `{"op":"ping"}` every 20s.
//!
//! Bybit drops the WebSocket if no application-level ping arrives
//! within ~30s. The reader will see the resulting close, but we want
//! to keep the connection alive proactively so subscriptions don't
//! reset mid-session.

use std::time::Duration;

use futures_util::SinkExt;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::bybit::client::SharedSink;

const PING_PAYLOAD: &str = r#"{"op":"ping"}"#;
pub const DEFAULT_INTERVAL: Duration = Duration::from_secs(20);

pub struct HeartbeatHandle {
    pub handle: JoinHandle<()>,
    pub shutdown: oneshot::Sender<()>,
}

pub fn spawn(sink: SharedSink, interval: Duration) -> HeartbeatHandle {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let handle = tokio::spawn(heartbeat_task(sink, interval, shutdown_rx));
    HeartbeatHandle {
        handle,
        shutdown: shutdown_tx,
    }
}

async fn heartbeat_task(
    sink: SharedSink,
    interval: Duration,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    tracing::info!("Bybit heartbeat started, interval={:?}", interval);

    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ticker.tick().await; // consume the immediate tick

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Bybit heartbeat: shutdown received");
                break;
            }
            _ = ticker.tick() => {
                let mut s = sink.lock().await;
                match s.send(Message::Text(PING_PAYLOAD.to_string())).await {
                    Ok(()) => tracing::trace!("Bybit ping sent"),
                    Err(e) => {
                        tracing::warn!("Bybit heartbeat send failed: {}", e);
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Bybit heartbeat exited");
}
