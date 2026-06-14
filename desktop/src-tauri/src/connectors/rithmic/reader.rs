//! Background reader task: drains the WebSocket stream half post-login,
//! decodes each frame by `template_id`, and fans matching ticks out
//! through the broadcast channel.

use std::collections::HashMap;

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

/// Rithmic `PresenceBits::LastTrade` — bit 1 in `presence_bits` means
/// this `LastTrade` frame carries a new trade print (price + size).
/// Frames without this bit are VWAP/NetChange/Volume-only updates that
/// should not be processed as trades.
const PRESENCE_BIT_LAST_TRADE: u32 = 1;

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

    // Last known best bid/ask per symbol (key = "MNQM6.CME" format).
    // Updated from BBO frames (template_id=151) and used as a last-resort
    // fallback when a LastTrade frame arrives without the aggressor field.
    let mut last_bbo: HashMap<String, (f64, f64)> = HashMap::new();

    // Last trade price + side per symbol, used for the tick-test fallback
    // (ATAS-compatible classification when the aggressor field is absent).
    //   price > last → Buy (lifted offer)
    //   price < last → Sell (hit bid)
    //   price == last → inherit prior direction (neutral tick)
    let mut last_trade_state: HashMap<String, (f64, Side)> = HashMap::new();

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Reader task: shutdown signal received");
                break;
            }
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Binary(data))) => {
                        if let Err(e) = handle_frame(&data, &tick_tx, &mut last_bbo, &mut last_trade_state) {
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

fn handle_frame(
    data: &[u8],
    tick_tx: &broadcast::Sender<Tick>,
    last_bbo: &mut HashMap<String, (f64, f64)>,
    last_trade_state: &mut HashMap<String, (f64, Side)>,
) -> Result<()> {
    let probe = TemplateProbe::decode(data)?;
    match probe.template_id {
        150 => {
            let trade = LastTrade::decode(data)?;
            match last_trade_to_tick(&trade, last_bbo, last_trade_state) {
                Some(tick) => {
                    tracing::debug!(
                        "LastTrade {} {:?} {}@{} (ts={})",
                        tick.symbol,
                        tick.side,
                        tick.qty,
                        tick.price,
                        tick.timestamp_ns
                    );
                    let _ = tick_tx.send(tick);
                }
                None => {
                    tracing::debug!(
                        "LastTrade {} dropped (price={:?} size={:?} aggressor={:?})",
                        trade.symbol.as_deref().unwrap_or("?"),
                        trade.trade_price,
                        trade.trade_size,
                        trade.aggressor,
                    );
                }
            }
        }
        151 => {
            let bbo = BestBidOffer::decode(data)?;
            // Update the per-symbol BBO cache used as aggressor fallback.
            if let (Some(sym), Some(bid), Some(ask)) = (
                bbo.symbol.as_deref(),
                bbo.bid_price,
                bbo.ask_price,
            ) {
                if bid > 0.0 && ask > 0.0 {
                    let exch = bbo.exchange.as_deref().unwrap_or("CME");
                    last_bbo.insert(format!("{}.{}", sym, exch), (bid, ask));
                }
            }
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
///
/// Classification priority:
///   1. Native `aggressor` field from Rithmic (BUY=1 / SELL=2) — most accurate.
///   2. Tick test against the last known trade price for this symbol — ATAS-
///      compatible fallback for frames where the aggressor field is absent
///      (common on Apex/4PropTrader gateway, especially for Paper fills).
///   3. BBO quote rule — last resort for the very first tick (no prior price).
///   4. Drop the tick if none of the above can classify it.
///
/// Frames filtered out entirely (not counted as trades):
///   - `is_snapshot = true`: subscription-time snapshot of the last trade,
///     not a new print. ATAS skips these; counting them inflates volume.
///   - `presence_bits` present but `LAST_TRADE` bit (1) absent: VWAP/
///     NetChange-only update, `trade_price`/`trade_size` are stale echoes.
fn last_trade_to_tick(
    t: &LastTrade,
    last_bbo: &HashMap<String, (f64, f64)>,
    last_trade_state: &mut HashMap<String, (f64, Side)>,
) -> Option<Tick> {
    // RC1 — skip subscription-snapshot frames (is_snapshot = true).
    // Rithmic sends one on subscribe to initialise the client with the
    // last known trade. It is NOT a new print; counting it inflates volume
    // vs ATAS which ignores it.
    if t.is_snapshot == Some(true) {
        tracing::debug!(
            "LastTrade {}: is_snapshot=true — skipped (not a new print)",
            t.symbol.as_deref().unwrap_or("?")
        );
        return None;
    }

    // RC3 — skip frames that carry no new trade data.
    // `presence_bits` is a bitmask; bit 1 (LAST_TRADE) must be set for the
    // price/size fields to represent a genuine new trade. Frames with only
    // bit 8 (Volume) or bit 16 (VWAP) set echo the last trade_price without
    // a new print having occurred. Only checked when the gateway sends the
    // field — absent presence_bits means "assume trade" (legacy gateways).
    if let Some(pb) = t.presence_bits {
        if pb & PRESENCE_BIT_LAST_TRADE == 0 {
            tracing::trace!(
                "LastTrade {}: presence_bits={:#010b} — no LAST_TRADE bit, skipped",
                t.symbol.as_deref().unwrap_or("?"),
                pb
            );
            return None;
        }
    }

    let price = t.trade_price?;
    let qty = t.trade_size? as f64;

    let symbol = t.symbol.clone().unwrap_or_default();
    let exchange = t.exchange.clone().unwrap_or_default();
    let symbol_key = format!("{}.{}", symbol, exchange);

    // 1. Native Rithmic aggressor field — preferred.
    let side = if let Some(agg) = t.aggressor {
        match agg {
            x if x == TransactionType::Buy as i32 => Side::Buy,
            x if x == TransactionType::Sell as i32 => Side::Sell,
            // Unknown value = structural update, not a directional print.
            _ => return None,
        }
    } else {
        // 2. Tick test — ATAS-compatible classification when aggressor absent.
        // Apex/4PropTrader omits the aggressor field on Paper fills and
        // occasionally on live fills.
        //   price > last_price → aggressor lifted the offer → Buy
        //   price < last_price → aggressor hit the bid     → Sell
        //   price == last_price → inherit prior direction  → same as last
        match last_trade_state.get(&symbol_key).copied() {
            Some((last_px, last_side)) => {
                if price > last_px {
                    Side::Buy
                } else if price < last_px {
                    Side::Sell
                } else {
                    last_side
                }
            }
            // 3. BBO quote rule — only for the very first tick when we have
            // no prior price to run the tick test against. At/above ask =
            // Buy; at/below bid = Sell; inside spread = midpoint heuristic.
            None => match last_bbo.get(&symbol_key) {
                Some(&(bid, ask)) => {
                    if price >= ask {
                        Side::Buy
                    } else if price <= bid {
                        Side::Sell
                    } else {
                        let mid = (bid + ask) / 2.0;
                        if price >= mid { Side::Buy } else { Side::Sell }
                    }
                }
                // 4. No aggressor, no prior price, no BBO — drop.
                None => {
                    tracing::debug!(
                        "LastTrade {}: aggressor absent, no prior trade, no BBO — dropped",
                        symbol_key
                    );
                    return None;
                }
            },
        }
    };

    // Update tick-test state for the next frame of this symbol.
    last_trade_state.insert(symbol_key.clone(), (price, side));

    // Prefer source_* (exchange-side timestamp) over ssboe/usecs
    // (Rithmic-side receipt). Falls back when the gateway omits the
    // exchange-precision triple. Last resort = local clock — better
    // than dropping the trade entirely. Apex confirmed (2026-05-10)
    // to ship LastTrade frames with all four timestamp fields empty,
    // which previously caused 100% of trades to be silently dropped
    // → no bars ever built → permanent "Waiting for data" UI state.
    let timestamp_ns = match (t.source_ssboe, t.source_usecs) {
        (Some(s), Some(us)) => {
            (s as u64) * 1_000_000_000 + (us as u64) * 1_000 + (t.source_nsecs.unwrap_or(0) as u64)
        }
        _ => match (t.ssboe, t.usecs) {
            (Some(s), Some(us)) => (s as u64) * 1_000_000_000 + (us as u64) * 1_000,
            _ => std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0),
        },
    };

    Some(Tick {
        timestamp_ns,
        price,
        qty,
        side,
        symbol: symbol_key,
        source: SOURCE_NAME.to_string(),
        seq: 0,
    })
}
