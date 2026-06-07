//! Phase B / M6b-1 — push-based tick emitter for the crypto
//! adapters.
//!
//! Each connected adapter exposes a broadcast::Sender<Tick> that
//! the engine pump already drains. We `subscribe()` a second
//! receiver here and forward ticks to the React side as a
//! `crypto-tick-batch` Tauri event so the heatmap can render
//! trade bubbles. Independent of the engine pump — neither
//! receiver blocks the other.
//!
//! ## Coalescing (item 4.8)
//!
//! Rather than emitting one IPC event per tick (which can burst to
//! hundreds of events/second on liquid crypto pairs), we accumulate
//! ticks in a `Vec` and flush the whole batch every 16 ms (≈ 60 FPS
//! — the browser frame budget). On idle the flush is a no-op.
//! Pattern is identical to `rithmic_events.rs` / `bridge_depth.rs`.
//!
//! ## Wire format
//!
//! camelCase + lowercase "buy"/"sell" so the JS layer doesn't have
//! to do enum munging. The event carries a `Vec<TickWire>` payload.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::task::JoinHandle;
use tokio::time::interval;

use crate::connectors::tick::{Side, Tick};

/// Emitted event name. Frontend must listen on this (not the old
/// single-tick `crypto-tick-update` which is no longer fired).
const TICK_BATCH_EVENT: &str = "crypto-tick-batch";

/// 16 ms ≈ 60 FPS. Aligns with the footprint and depth emitters so
/// all coalesced events land in the same browser frame budget.
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);

/// Serialisable tick sent over IPC.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TickWire {
    symbol: String,
    price: f64,
    quantity: f64,
    side: &'static str,
    timestamp_ns: u64,
}

pub fn spawn_emitter(app: AppHandle, mut rx: Receiver<Tick>) -> JoinHandle<()> {
    // tokio::spawn rather than tauri::async_runtime::spawn — we
    // call this from within a Tauri command handler (so a tokio
    // runtime is already in scope) and the per-adapter cleanup
    // path holds onto the resulting tokio::task::JoinHandle so
    // it can `.abort()` on disconnect.
    tokio::spawn(async move {
        tracing::info!(
            "Crypto tick emitter started (coalescing window={:?})",
            FLUSH_INTERVAL
        );

        // Pre-allocate with a reasonable burst capacity.  Vec
        // retains its allocation between drains, so subsequent
        // frames don't re-allocate on the hot path.
        let mut pending: Vec<TickWire> = Vec::with_capacity(64);
        let mut flush = interval(FLUSH_INTERVAL);
        // Wait the full interval before the first flush rather than
        // firing immediately — mirrors rithmic_events.rs behaviour.
        flush.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                result = rx.recv() => {
                    match result {
                        Ok(tick) => {
                            pending.push(TickWire {
                                symbol: tick.symbol,
                                price: tick.price,
                                quantity: tick.qty,
                                side: match tick.side {
                                    Side::Buy  => "buy",
                                    Side::Sell => "sell",
                                },
                                timestamp_ns: tick.timestamp_ns,
                            });
                        }
                        Err(RecvError::Lagged(n)) => {
                            // Bursts of 50+ ticks/sec can outpace a slow
                            // listener; we drop the lagged ones and keep
                            // forwarding rather than block the source.
                            tracing::warn!("Crypto tick emitter lagged, dropped {n} ticks");
                        }
                        Err(RecvError::Closed) => {
                            tracing::info!("Tick channel closed, emitter exiting");
                            break;
                        }
                    }
                }
                _ = flush.tick() => {
                    if pending.is_empty() {
                        continue;
                    }
                    // `drain(..)` empties the Vec but keeps the
                    // allocation alive — no realloc on the next burst.
                    let batch: Vec<TickWire> = pending.drain(..).collect();
                    if let Err(e) = app.emit(TICK_BATCH_EVENT, &batch) {
                        tracing::warn!("Failed to emit {}: {e}", TICK_BATCH_EVENT);
                    }
                }
            }
        }
    })
}
