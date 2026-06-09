//! L2 Depth-of-Market state holder + IPC emitter for the Quantower bridge.
//! Mirror of bridge_depth.rs — same logic, different event name + type names.

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

const DEPTH_BATCH_EVENT: &str = "quantower-depth-update";
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
const PRICE_SCALE: f64 = 1_000_000.0;

#[derive(Default, Debug, Clone)]
pub struct OrderBook {
    pub bids: HashMap<i64, u64>,
    pub asks: HashMap<i64, u64>,
    pub last_update_ns: u64,
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
    pub bids: Vec<DepthLevel>,
    pub asks: Vec<DepthLevel>,
    pub last_update_ns: u64,
}

#[derive(Default)]
pub struct QuantowerDepthState {
    pub books: Arc<RwLock<HashMap<String, OrderBook>>>,
}

impl QuantowerDepthState {
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

pub fn spawn_pump(
    mut rx: Receiver<(String, DepthUpdate)>,
    state: Arc<QuantowerDepthState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Quantower depth pump started");
        loop {
            match rx.recv().await {
                Ok((symbol, update)) => {
                    apply_update(&state, &symbol, &update).await;
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Quantower depth pump lagged, dropped {n} updates");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Quantower depth broadcast closed — pump exiting");
                    break;
                }
            }
        }
    })
}

async fn apply_update(state: &QuantowerDepthState, symbol: &str, update: &DepthUpdate) {
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

pub fn spawn_emitter(app: AppHandle, state: Arc<QuantowerDepthState>) {
    async_runtime::spawn(async move {
        tracing::info!(
            "Quantower depth IPC emitter started (window={:?})",
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

async fn snapshot_dirty(state: &QuantowerDepthState) -> Vec<DepthSnapshot> {
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

#[tauri::command]
pub async fn quantower_get_depth(
    state: tauri::State<'_, Arc<QuantowerDepthState>>,
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
