//! Background reader task: drains the WebSocket stream half post-login,
//! decodes each frame by `template_id`, and fans matching ticks out
//! through the broadcast channel.

use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use tokio::sync::{broadcast, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::error::Result;
use crate::connectors::rithmic::client::{SharedSink, TemplateProbe, WsRead};
use crate::connectors::rithmic::proto::{
    last_trade::TransactionType, BestBidOffer, LastTrade, ResponseMarketDataUpdate,
};
use crate::connectors::tick::{Side, Tick};

const SOURCE_NAME: &str = "rithmic";

/// Spawn the reader task and return its `JoinHandle`. The task ends
/// when the shutdown channel is dropped or fires, when the server
/// closes the connection, or when the WebSocket errors out.
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
    tracing::info!("Reader task started");

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Reader task: shutdown signal received");
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Binary(data))) => {
                        if let Err(e) = handle_frame(&data, &tick_tx) {
                            tracing::warn!("Reader: frame handling failed: {}", e);
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        // Need to pong via the shared sink so the
                        // server doesn't drop us for being unresponsive.
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("Reader: failed to send pong: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("Reader: server closed connection ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => { /* Pong / Text / Frame: skip */ }
                    Some(Err(e)) => {
                        tracing::error!("Reader: WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        tracing::warn!("Reader: WebSocket stream ended");
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Reader task exited");
}

fn handle_frame(data: &[u8], tick_tx: &broadcast::Sender<Tick>) -> Result<()> {
    let probe = TemplateProbe::decode(data)?;
    match probe.template_id {
        150 => {
            let trade = LastTrade::decode(data)?;
            if let Some(tick) = last_trade_to_tick(&trade) {
                let _ = tick_tx.send(tick);
            }
        }
        151 => {
            let bbo = BestBidOffer::decode(data)?;
            tracing::debug!(
                "BBO {} bid={}@{} ask={}@{}",
                bbo.symbol.as_deref().unwrap_or("?"),
                bbo.bid_size.unwrap_or(0),
                bbo.bid_price.unwrap_or(0.0),
                bbo.ask_size.unwrap_or(0),
                bbo.ask_price.unwrap_or(0.0),
            );
        }
        13 => tracing::info!("Reader: ResponseLogout received"),
        19 => tracing::trace!("Reader: ResponseHeartbeat received"),
        101 => {
            let ack = ResponseMarketDataUpdate::decode(data)?;
            let primary = ack.rp_code.first().map(|s| s.as_str()).unwrap_or("?");
            if primary == "0" {
                tracing::info!(
                    "Reader: ResponseMarketDataUpdate ack OK (user_msg={:?})",
                    ack.user_msg
                );
            } else {
                tracing::warn!(
                    "Reader: ResponseMarketDataUpdate failed: rp_code={:?} user_msg={:?}",
                    ack.rp_code,
                    ack.user_msg
                );
            }
        }
        other => tracing::debug!("Reader: unhandled template_id {}", other),
    }
    Ok(())
}

/// Convert a Rithmic LastTrade message into a normalized Tick.
/// Returns `None` when the message lacks the price/size/side fields
/// or carries an unknown aggressor — typically those frames are
/// sub-snapshot updates that don't represent an actual print.
fn last_trade_to_tick(t: &LastTrade) -> Option<Tick> {
    let price = t.trade_price?;
    let qty = t.trade_size? as f64;

    // TransactionType::Buy = 1, Sell = 2. Anything else is a
    // structural update we don't model as a directional tick.
    let side = match t.aggressor? {
        x if x == TransactionType::Buy as i32 => Side::Buy,
        x if x == TransactionType::Sell as i32 => Side::Sell,
        _ => return None,
    };

    // Prefer source_* (exchange-side timestamp) over ssboe/usecs
    // (Rithmic-side receipt). Falls back when the gateway omits the
    // exchange-precision triple.
    let timestamp_ns = match (t.source_ssboe, t.source_usecs) {
        (Some(s), Some(us)) => {
            (s as u64) * 1_000_000_000
                + (us as u64) * 1_000
                + (t.source_nsecs.unwrap_or(0) as u64)
        }
        _ => match (t.ssboe, t.usecs) {
            (Some(s), Some(us)) => (s as u64) * 1_000_000_000 + (us as u64) * 1_000,
            _ => return None,
        },
    };

    let symbol = t.symbol.clone().unwrap_or_default();
    let exchange = t.exchange.clone().unwrap_or_default();

    Some(Tick {
        timestamp_ns,
        price,
        qty,
        side,
        symbol: format!("{}.{}", symbol, exchange),
        source: SOURCE_NAME.to_string(),
    })
}
