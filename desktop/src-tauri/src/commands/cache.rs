//! Tauri command exposing the bars cache to the frontend.
//!
//! Mirrors the args shape used by `rithmic_fetch_tick_history`
//! (camelCase + `hoursBack`) so the React layer treats both paths
//! interchangeably and the only difference is the command name.

use std::sync::Arc;

use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;
use tokio::sync::Mutex;

use crate::cache::reader::{query_bars, CachedBar};

/// Shared SQLite connection registered as Tauri-managed state by
/// `lib.rs::run()`. We hold the connection behind a `tokio::Mutex`
/// because the writer task also writes to it; the lock is brief.
pub struct CacheState {
    pub conn: Arc<Mutex<Connection>>,
}

impl CacheState {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheQueryArgs {
    /// Compound symbol — `"MNQM6.CME"`, identical to what
    /// `fetch_tick_footprint_bars` receives in `symbol.exchange`.
    /// The split is purely a frontend concept; the backend persists
    /// the compound form.
    pub full_symbol: String,
    pub timeframe: String,
    /// How far back to read, in hours. `[now - hours_back, now)`.
    pub hours_back: i64,
}

#[tauri::command]
pub async fn cache_query(
    state: State<'_, CacheState>,
    args: CacheQueryArgs,
) -> Result<Vec<CachedBar>, String> {
    let now_ns: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(i64::MAX);
    let hours_back = args.hours_back.max(1);
    let ts_from = now_ns - hours_back * 3600 * 1_000_000_000;
    let conn = state.conn.clone();
    let full_symbol = args.full_symbol;
    let timeframe = args.timeframe;
    let full_symbol_for_query = full_symbol.clone();
    let timeframe_for_query = timeframe.clone();
    // SQLite reads are CPU-bound — hop off the async runtime so the
    // tick stream and renderer events keep flowing.
    let bars = tokio::task::spawn_blocking(move || {
        let guard = conn.blocking_lock();
        query_bars(
            &guard,
            &full_symbol_for_query,
            &timeframe_for_query,
            ts_from,
            now_ns,
        )
    })
    .await
    .map_err(|e| format!("cache_query task panicked: {e}"))?
    .map_err(|e| format!("cache_query failed: {e}"))?;
    tracing::info!(
        "cache_query: {} bars for {}.{} ({}h)",
        bars.len(),
        full_symbol,
        timeframe,
        hours_back,
    );
    Ok(bars)
}
