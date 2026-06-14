//! Phase B / M3 — push-based event emitter for the crypto-side
//! FootprintEngine. Symmetric to `commands::rithmic_events` but
//! routes the long-lived `CryptoState.engine` updates to a separate
//! Tauri event channel so the React side can disambiguate sources.
//!
//! ## Coalescing
//!
//! Like the Rithmic emitter, this used to fire ONE Tauri event per bar
//! update. The engine fans out every configured timeframe per tick, so
//! a fast crypto ticker (BTC/ETH perp in an active session) produced
//! hundreds of emits/sec — each a full JSON serialization + IPC cross +
//! JS handler — collapsing the WebView from 60 FPS to single digits.
//!
//! The fix mirrors `rithmic_events`:
//!   1. Accumulate incoming bars in a `HashMap` keyed by
//!      `(symbol, timeframe, bucket_ts_ns)`. Repeated updates to the
//!      same bar within the flush window overwrite the prior copy, so
//!      we only emit the *final* state of each bar per flush.
//!   2. Flush every 16 ms (≈60 FPS) as a single
//!      `crypto-footprint-update-batch` event carrying
//!      `Vec<FootprintBar>`.
//!
//! On idle (no updates) we don't emit anything, so the cost is zero
//! when nothing is happening.
//!
//! ## Compatibility
//!
//! The frontend (`CryptoFootprint.tsx`) listens on
//! `crypto-footprint-update-batch`. The old single
//! `crypto-footprint-update` event is no longer fired.
//!
//! Spawned once at app startup, before any adapter exists. The engine
//! outlives any single connect/disconnect cycle, so this task only stops
//! if the engine's broadcast channel is dropped (which doesn't happen
//! during normal operation).

use std::collections::HashMap;
use std::time::Duration;

use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::time::interval;

use crate::engine::{FootprintBar, FootprintEngine};

const CRYPTO_FOOTPRINT_BATCH_EVENT: &str = "crypto-footprint-update-batch";
/// 16ms = browser frame budget at 60 FPS. Sending faster than this
/// is wasted work; sending slower introduces visible lag.
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);

/// Coalesce key for a footprint bar. The triplet uniquely identifies a
/// bar across all symbols + timeframes + buckets, so multiple updates
/// to the same bar within a flush window collapse into one entry.
type BarKey = (String, &'static str, u64);

pub fn spawn_emitter(app: AppHandle, engine: &FootprintEngine) {
    let mut update_rx = engine.updates();
    async_runtime::spawn(async move {
        tracing::info!(
            "Crypto footprint event emitter started (coalescing window: {:?})",
            FLUSH_INTERVAL
        );
        let mut pending: HashMap<BarKey, FootprintBar> = HashMap::with_capacity(128);
        let mut flush = interval(FLUSH_INTERVAL);
        // Wait the full interval before the first flush, and don't try
        // to "catch up" missed ticks after a stall.
        flush.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                recv = update_rx.recv() => {
                    match recv {
                        Ok(bar) => {
                            let key: BarKey = (
                                bar.symbol.clone(),
                                bar.timeframe,
                                bar.bucket_ts_ns,
                            );
                            // Overwrite — we only care about the most
                            // recent state of each bar per flush window.
                            pending.insert(key, bar);
                        }
                        Err(RecvError::Lagged(n)) => {
                            tracing::warn!(
                                "Crypto footprint emitter lagged, dropped {n} updates"
                            );
                        }
                        Err(RecvError::Closed) => {
                            tracing::info!(
                                "Crypto engine update channel closed, emitter exiting"
                            );
                            break;
                        }
                    }
                }
                _ = flush.tick() => {
                    if pending.is_empty() {
                        continue;
                    }
                    // drain() leaves the HashMap allocated, so subsequent
                    // inserts don't re-allocate the bucket array.
                    let batch: Vec<FootprintBar> = pending
                        .drain()
                        .map(|(_, bar)| bar)
                        .collect();
                    if let Err(e) = app.emit(CRYPTO_FOOTPRINT_BATCH_EVENT, &batch) {
                        tracing::warn!(
                            "Failed to emit {}: {e}",
                            CRYPTO_FOOTPRINT_BATCH_EVENT
                        );
                    }
                }
            }
        }
    });
}
