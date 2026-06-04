//! L2 Depth-of-Market state holder + IPC emitter for the NinjaTrader
//! bridge.
//!
//! ## Flow
//!
//!   reader -> broadcast::Sender<(symbol, DepthUpdate)>
//!     │
//!     ├── pump_task        : applies each event to the per-symbol book
//!     │                      (HashMap<symbol, OrderBook>)
//!     │
//!     └── emitter_task     : every FLUSH_INTERVAL_MS, snapshots the
//!                            book for every symbol that changed since
//!                            the last flush and emits a single
//!                            `bridge-depth-update` Tauri event with a
//!                            `Vec<DepthSnapshot>` payload.
//!
//! Why two tasks: the pump can run faster than the UI needs (depth
//! events can fire > 1 kHz on open / close). Coalescing on a 16 ms
//! window (~60 FPS) caps the IPC cross-rate while keeping the book
//! state always current for the snapshot Tauri command.
//!
//! ## Snapshot semantics
//!
//! Each side is a `HashMap<i64, u64>` where the i64 key is
//! `(price * 1e6).round()` — gives 6-decimal-place precision on any
//! futures contract we trade (CL = 0.01, GC = 0.10, MNQ = 0.25, ZB =
//! 1/32 = 0.03125, etc.). The snapshot Vec returned to the frontend
//! sorts levels descending (bids best→worst, asks best→worst from the
//! same midpoint) so the UI can render row-by-row without re-sorting.
//!
//! Mid-session symbol switches (MNQ → CL) leave the old book in the
//! HashMap. It stops getting updated and the frontend stops requesting
//! it, so memory cost is bounded by the number of distinct symbols a
//! user trades in one session (typically ≤ 5).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio::time::interval;

use crate::connectors::bridge::parser::{DepthOp, DepthSide, DepthUpdate};

const DEPTH_BATCH_EVENT: &str = "bridge-depth-update";
/// 16 ms ≈ 60 FPS. Matches the footprint emitter's window so the UI
/// gets aligned redraw deadlines.
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
/// Price precision multiplier for the integer-keyed level map.
const PRICE_SCALE: f64 = 1_000_000.0;

#[derive(Default, Debug, Clone)]
pub struct OrderBook {
    pub bids: HashMap<i64, u64>,
    pub asks: HashMap<i64, u64>,
    pub last_update_ns: u64,
    /// Flipped to true by the pump on every applied update; cleared
    /// to false by the emitter on each flush. Lets the emitter skip
    /// symbols that didn't change since the last frame instead of
    /// re-serializing identical state.
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthLevel {
    pub price: f64,
    pub volume: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthSnapshot {
    pub symbol: String,
    /// Best bid first (highest price → lowest price).
    pub bids: Vec<DepthLevel>,
    /// Best ask first (lowest price → highest price).
    pub asks: Vec<DepthLevel>,
    pub last_update_ns: u64,
}

#[derive(Default)]
pub struct BridgeDepthState {
    /// Per-symbol orderbook. Wrapped in RwLock so the IPC emitter
    /// can take read snapshots without blocking the pump for too
    /// long.
    pub books: Arc<RwLock<HashMap<String, OrderBook>>>,
}

impl BridgeDepthState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[inline]
fn price_key(price: f64) -> i64 {
    (price * PRICE_SCALE).round() as i64
}

#[inline]
fn key_to_price(key: i64) -> f64 {
    key as f64 / PRICE_SCALE
}

/// Spawn the per-session pump that consumes one specific bridge
/// adapter's depth receiver and updates the per-symbol OrderBook
/// in-place. Returns a JoinHandle so `bridge_disconnect` can abort it
/// alongside the tick pump + state emitter.
///
/// `tokio::spawn` (not `tauri::async_runtime::spawn`) because callers
/// run inside a Tauri command — already in a tokio runtime context —
/// and BridgeState's `depth_pump` field is typed on tokio's
/// JoinHandle to stay consistent with the existing `engine_pump` /
/// `state_emit` fields.
pub fn spawn_pump(
    mut rx: Receiver<(String, DepthUpdate)>,
    state: Arc<BridgeDepthState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Bridge depth pump started");
        loop {
            match rx.recv().await {
                Ok((symbol, update)) => {
                    apply_update(&state, &symbol, &update).await;
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Bridge depth pump lagged, dropped {n} updates");
                }
                Err(RecvError::Closed) => {
                    tracing::info!(
                        "Bridge depth broadcast closed — pump exiting"
                    );
                    break;
                }
            }
        }
    })
}

async fn apply_update(state: &BridgeDepthState, symbol: &str, update: &DepthUpdate) {
    let mut books = state.books.write().await;
    let book = books.entry(symbol.to_string()).or_default();
    let side = match update.side {
        DepthSide::Bid => &mut book.bids,
        DepthSide::Ask => &mut book.asks,
    };
    let key = price_key(update.price);
    match update.op {
        DepthOp::Upsert => {
            if update.volume == 0 {
                // Treat upsert-with-zero as a delete — defensive for
                // brokers that emit a final size=0 instead of an
                // explicit Remove. NT itself uses op=Remove but we
                // can't trust every feed.
                side.remove(&key);
            } else {
                side.insert(key, update.volume);
            }
        }
        DepthOp::Delete => {
            side.remove(&key);
        }
    }
    book.last_update_ns = update.timestamp_ns;
    book.dirty = true;
}

/// Spawns the long-lived IPC emitter: every FLUSH_INTERVAL, snapshots
/// every dirty book and pushes a single `bridge-depth-update` event
/// with the whole batch.
pub fn spawn_emitter(app: AppHandle, state: Arc<BridgeDepthState>) {
    async_runtime::spawn(async move {
        tracing::info!(
            "Bridge depth IPC emitter started (window={:?})",
            FLUSH_INTERVAL
        );
        let mut ticker = interval(FLUSH_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let batch = snapshot_dirty(&state).await;
            if batch.is_empty() {
                continue;
            }
            if let Err(e) = app.emit(DEPTH_BATCH_EVENT, &batch) {
                tracing::warn!("Failed to emit {}: {e}", DEPTH_BATCH_EVENT);
            }
        }
    });
}

async fn snapshot_dirty(state: &BridgeDepthState) -> Vec<DepthSnapshot> {
    let mut books = state.books.write().await;
    let mut out: Vec<DepthSnapshot> = Vec::with_capacity(books.len());
    for (symbol, book) in books.iter_mut() {
        if !book.dirty {
            continue;
        }
        book.dirty = false;
        out.push(DepthSnapshot {
            symbol: symbol.clone(),
            bids: sorted_levels(&book.bids, true),
            asks: sorted_levels(&book.asks, false),
            last_update_ns: book.last_update_ns,
        });
    }
    out
}

fn sorted_levels(map: &HashMap<i64, u64>, descending: bool) -> Vec<DepthLevel> {
    let mut levels: Vec<DepthLevel> = map
        .iter()
        .map(|(k, v)| DepthLevel {
            price: key_to_price(*k),
            volume: *v,
        })
        .collect();
    if descending {
        levels.sort_by(|a, b| b.price.partial_cmp(&a.price).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        levels.sort_by(|a, b| a.price.partial_cmp(&b.price).unwrap_or(std::cmp::Ordering::Equal));
    }
    levels
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDepthArgs {
    pub symbol: String,
}

/// One-shot snapshot fetch for a specific symbol. Used by the
/// frontend on mount or symbol-change to seed the panel before
/// the next coalesced `bridge-depth-update` event arrives.
#[tauri::command]
pub async fn bridge_get_depth(
    state: tauri::State<'_, Arc<BridgeDepthState>>,
    args: GetDepthArgs,
) -> Result<Option<DepthSnapshot>, String> {
    let books = state.books.read().await;
    Ok(books.get(&args.symbol).map(|book| DepthSnapshot {
        symbol: args.symbol.clone(),
        bids: sorted_levels(&book.bids, true),
        asks: sorted_levels(&book.asks, false),
        last_update_ns: book.last_update_ns,
    }))
}
