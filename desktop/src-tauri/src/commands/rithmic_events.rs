//! Push-based event emitter that forwards updated FootprintBars coming
//! out of the engine to the React webview.
//!
//! ## Coalescing
//!
//! Previous version emitted ONE Tauri event per bar update. Since the
//! engine fans out 9 timeframes per tick (Sec5 / Sec15 / Sec30 / Min1 /
//! Min3 / Min5 / Min15 / Hour1 / Ticks100), a fast ticker like MNQ at
//! ~50 ticks/sec produced 450 emits/sec — each one a full JSON
//! serialization + IPC cross + JS handler. That dropped the WebView
//! from 60 FPS to 3-8 FPS during a live session, making the app
//! unusable.
//!
//! The fix:
//!   1. Accumulate incoming bars in a `HashMap` keyed by
//!      `(symbol, timeframe, bucket_ts_ns)`. Repeated updates to the
//!      same bar within the flush window overwrite the prior copy, so
//!      we only emit the *final* state of each bar per flush.
//!   2. Flush every 16 ms (≈60 FPS — the browser frame budget) as a
//!      single `footprint-update-batch` event carrying
//!      `Vec<FootprintBar>`.
//!
//! On idle (no updates) we don't emit anything, so the cost is zero
//! when nothing is happening.
//!
//! ## Compatibility
//!
//! The frontend listens on `footprint-update-batch`. The old single
//! `footprint-update` event is no longer fired — make sure both
//! `BridgeFootprint.tsx` and `RithmicFootprint.tsx` are migrated
//! before shipping this change.
//!
//! NOTE: we spawn via `tauri::async_runtime::spawn` (not `tokio::spawn`)
//! because this runs from inside Tauri's `setup` hook, before a Tokio
//! runtime context is established.

use std::collections::HashMap;
use std::time::Duration;

use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::time::interval;

use crate::engine::{FootprintBar, FootprintEngine};

const FOOTPRINT_BATCH_EVENT: &str = "footprint-update-batch";
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
            "Footprint event emitter started (coalescing window: {:?})",
            FLUSH_INTERVAL
        );
        let mut pending: HashMap<BarKey, FootprintBar> = HashMap::with_capacity(128);
        let mut flush = interval(FLUSH_INTERVAL);
        // Skip the immediate first tick — we want to wait the full
        // interval before the first flush, not flush instantly.
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
                                "Footprint emitter lagged, dropped {n} updates"
                            );
                        }
                        Err(RecvError::Closed) => {
                            tracing::info!(
                                "Engine update channel closed, emitter exiting"
                            );
                            break;
                        }
                    }
                }
                _ = flush.tick() => {
                    if pending.is_empty() {
                        continue;
                    }
                    // Drain into a Vec for serialization. drain() leaves
                    // the HashMap allocated, so subsequent inserts don't
                    // re-allocate the bucket array — important on the
                    // hot path.
                    let batch: Vec<FootprintBar> = pending
                        .drain()
                        .map(|(_, bar)| bar)
                        .collect();
                    if let Err(e) = app.emit(FOOTPRINT_BATCH_EVENT, &batch) {
                        tracing::warn!(
                            "Failed to emit {}: {e}",
                            FOOTPRINT_BATCH_EVENT
                        );
                    }
                }
            }
        }
    });
}
