//! Phase B / M6b-1 — push-based tick emitter for the crypto
//! adapters.
//!
//! Each connected adapter exposes a broadcast::Sender<Tick> that
//! the engine pump already drains. We `subscribe()` a second
//! receiver here and forward every tick to the React side as a
//! `crypto-tick-update` Tauri event so the heatmap can render
//! trade bubbles. Independent of the engine pump — neither
//! receiver blocks the other.
//!
//! Wire format mirrors the orderbook event: camelCase + lowercase
//! "buy"/"sell" so the JS layer doesn't have to do enum munging.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::task::JoinHandle;

use crate::connectors::tick::{Side, Tick};

const TICK_EVENT: &str = "crypto-tick-update";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TickWire<'a> {
    symbol: &'a str,
    price: f64,
    quantity: f64,
    side: &'a str,
    timestamp_ns: u64,
}

pub fn spawn_emitter(app: AppHandle, mut rx: Receiver<Tick>) -> JoinHandle<()> {
    // tokio::spawn rather than tauri::async_runtime::spawn — we
    // call this from within a Tauri command handler (so a tokio
    // runtime is already in scope) and the per-adapter cleanup
    // path holds onto the resulting tokio::task::JoinHandle so
    // it can `.abort()` on disconnect.
    tokio::spawn(async move {
        tracing::info!("Crypto tick emitter started");
        loop {
            match rx.recv().await {
                Ok(tick) => {
                    let wire = TickWire {
                        symbol: &tick.symbol,
                        price: tick.price,
                        quantity: tick.qty,
                        side: match tick.side {
                            Side::Buy => "buy",
                            Side::Sell => "sell",
                        },
                        timestamp_ns: tick.timestamp_ns,
                    };
                    if let Err(e) = app.emit(TICK_EVENT, &wire) {
                        tracing::warn!("Failed to emit {}: {e}", TICK_EVENT);
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    // Bursts of 50+ ticks/sec can outpace a slow
                    // listener; we drop the lagged ones and keep
                    // forwarding rather than block the source.
                    tracing::warn!("Tick emitter lagged, dropped {n}");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Tick channel closed, emitter exiting");
                    break;
                }
            }
        }
    })
}
