//! Background reader task for Bybit V5 public streams.

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::bybit::client::{SharedSink, WsRead};
use crate::connectors::bybit::parser::{parse_message, BybitTradeMessage};
use crate::connectors::tick::Tick;

pub fn spawn(
    stream: WsRead,
    sink: SharedSink,
    tick_tx: broadcast::Sender<Tick>,
    shutdown_rx: oneshot::Receiver<()>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(reader_task(stream, sink, tick_tx, shutdown_rx))
}

async fn reader_task(
    mut stream: WsRead,
    sink: SharedSink,
    tick_tx: broadcast::Sender<Tick>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    tracing::info!("Bybit reader task started");

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Bybit reader: shutdown received");
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => handle_text(&text, &tick_tx),
                    Some(Ok(Message::Ping(payload))) => {
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("Bybit reader: pong send failed: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("Bybit reader: server closed ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        tracing::error!("Bybit reader: WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        tracing::warn!("Bybit reader: stream ended");
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Bybit reader exited");
}

fn handle_text(text: &str, tick_tx: &broadcast::Sender<Tick>) {
    if let Ok(msg) = serde_json::from_str::<BybitTradeMessage>(text) {
        for tick in parse_message(&msg) {
            let _ = tick_tx.send(tick);
        }
        return;
    }
    // Subscription acks {"success":true,...}, pong replies, etc.
    tracing::trace!("Bybit reader: ignored frame: {}", text);
}
