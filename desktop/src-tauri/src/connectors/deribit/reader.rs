//! Background reader task for Deribit V2.

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::deribit::client::{SharedSink, WsRead};
use crate::connectors::deribit::parser::parse_message;
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
    tracing::info!("Deribit reader task started");

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Deribit reader: shutdown received");
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        for tick in parse_message(&text) {
                            let _ = tick_tx.send(tick);
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("Deribit reader: pong send failed: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("Deribit reader: server closed ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        tracing::error!("Deribit reader: WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        tracing::warn!("Deribit reader: stream ended");
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Deribit reader exited");
}
