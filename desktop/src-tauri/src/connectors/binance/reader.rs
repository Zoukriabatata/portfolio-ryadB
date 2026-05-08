//! Background reader task for Binance.
//!
//! Drains text frames from the WebSocket, dispatches `aggTrade`
//! payloads through the parser into the broadcast channel, and
//! handles ping/close frames so the connection stays healthy.
//! Subscription acks (`{"result":null,"id":N}`) are silently ignored.

use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::binance::client::{SharedSink, WsRead};
use crate::connectors::binance::parser::{agg_trade_to_tick, BinanceAggTrade};
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
    tracing::info!("Binance reader task started");

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Binance reader: shutdown signal received");
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => handle_text(&text, &tick_tx),
                    Some(Ok(Message::Ping(payload))) => {
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("Binance reader: failed to send pong: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("Binance reader: server closed ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        tracing::error!("Binance reader: WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        tracing::warn!("Binance reader: WebSocket stream ended");
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Binance reader task exited");
}

fn handle_text(text: &str, tick_tx: &broadcast::Sender<Tick>) {
    if let Ok(msg) = serde_json::from_str::<BinanceAggTrade>(text) {
        if let Some(tick) = agg_trade_to_tick(&msg) {
            let _ = tick_tx.send(tick);
            return;
        }
    }
    // Subscription acks and unrelated frames land here silently.
    tracing::trace!("Binance reader: ignored frame: {}", text);
}
