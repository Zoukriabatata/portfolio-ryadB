//! Tauri IPC commands for the native Journal.
//!
//! Maps the website's `/api/journal/*` endpoints to local SQLite calls.
//! All shapes use serde camelCase rename so the frontend can keep its
//! existing TypeScript types from the web codebase verbatim.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::journal::{
    CalendarDay, CalendarMonthStats, DailyNote, JournalDb, PlaybookSetup, Trade, TradeFilter,
    TradeStats,
};

pub struct JournalState(pub std::sync::Arc<JournalDb>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTradesResult {
    pub entries: Vec<Trade>,
    pub total: i64,
    pub stats: TradeStats,
}

#[tauri::command]
pub async fn journal_list_trades(
    state: State<'_, JournalState>,
    filter: TradeFilter,
) -> Result<ListTradesResult, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let entries = db.list_trades(&filter).map_err(|e| e.to_string())?;
        let total = db.count_trades(&filter).map_err(|e| e.to_string())?;
        let stats = db.stats(&filter).map_err(|e| e.to_string())?;
        Ok(ListTradesResult {
            entries,
            total,
            stats,
        })
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_get_trade(
    state: State<'_, JournalState>,
    id: String,
) -> Result<Option<Trade>, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.get_trade(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_create_trade(
    state: State<'_, JournalState>,
    trade: Trade,
) -> Result<Trade, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.create_trade(trade).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_update_trade(
    state: State<'_, JournalState>,
    trade: Trade,
) -> Result<Trade, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.update_trade(trade).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_delete_trade(
    state: State<'_, JournalState>,
    id: String,
) -> Result<usize, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.delete_trade(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteArgs {
    pub ids: Vec<String>,
}

#[tauri::command]
pub async fn journal_bulk_delete(
    state: State<'_, JournalState>,
    args: BulkDeleteArgs,
) -> Result<usize, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.delete_trades_bulk(&args.ids).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

// ── Day 2: Calendar + Daily Notes ─────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMonthResult {
    pub days: Vec<CalendarDay>,
    pub stats: CalendarMonthStats,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMonthArgs {
    /// "YYYY-MM"
    pub month: String,
}

#[tauri::command]
pub async fn journal_calendar_month(
    state: State<'_, JournalState>,
    args: CalendarMonthArgs,
) -> Result<CalendarMonthResult, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let (days, stats) = db.calendar_month(&args.month).map_err(|e| e.to_string())?;
        Ok(CalendarMonthResult { days, stats })
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradesOnDayArgs {
    /// "YYYY-MM-DD"
    pub date: String,
}

#[tauri::command]
pub async fn journal_trades_on_day(
    state: State<'_, JournalState>,
    args: TradesOnDayArgs,
) -> Result<Vec<Trade>, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.trades_on_day(&args.date).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_save_daily_note(
    state: State<'_, JournalState>,
    note: DailyNote,
) -> Result<DailyNote, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.upsert_daily_note(note).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_delete_daily_note(
    state: State<'_, JournalState>,
    id: String,
) -> Result<usize, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.delete_daily_note(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyNotesMonthArgs {
    /// "YYYY-MM"
    pub month: String,
}

#[tauri::command]
pub async fn journal_list_daily_notes_month(
    state: State<'_, JournalState>,
    args: DailyNotesMonthArgs,
) -> Result<Vec<DailyNote>, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        db.list_daily_notes_month(&args.month)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))?
}

// ── Rithmic sync ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRithmicArgs {
    /// Lookback window in calendar days. Defaults to 60 if absent.
    pub days: Option<u32>,
}

const APP_NAME: &str = "Senzoukria";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// One-shot pull of Apex / Rithmic order history into the local journal.
/// The bulk of the work is in `journal::rithmic_sync::sync()` — this
/// command just pumps the request from the UI to that orchestrator and
/// keeps the spawn_blocking dance off the renderer thread.
#[tauri::command]
pub async fn journal_sync_rithmic(
    state: State<'_, JournalState>,
    args: SyncRithmicArgs,
) -> Result<crate::journal::SyncResult, String> {
    let db = state.0.clone();
    let days = args.days.unwrap_or(crate::journal::DEFAULT_LOOKBACK_DAYS);
    crate::journal::rithmic_sync::sync(db, days, APP_NAME, APP_VERSION).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    /// Number of trades currently flagged as `external_source = "rithmic"`.
    pub imported_count: i64,
    /// Newest entry_time across imported trades, or null if nothing has
    /// been synced yet — drives the "Last sync at …" pill in the UI.
    pub last_imported_at: Option<String>,
}

// ── Playbook setups (Day 3) ───────────────────────────────────────────

#[tauri::command]
pub async fn journal_list_playbook_setups(
    state: State<'_, JournalState>,
) -> Result<Vec<PlaybookSetup>, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.list_playbook_setups().map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_save_playbook_setup(
    state: State<'_, JournalState>,
    setup: PlaybookSetup,
) -> Result<PlaybookSetup, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.upsert_playbook_setup(setup).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_delete_playbook_setup(
    state: State<'_, JournalState>,
    id: String,
) -> Result<usize, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || db.delete_playbook_setup(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("task join failed: {e}"))?
}

// ── CSV batch import (Apex / NinjaTrader / TradingView export) ────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTradesArgs {
    /// Pre-parsed rows from the CSV — the frontend does the parsing
    /// (easier to tweak column heuristics in TS than to ship a Rust
    /// CSV lib + regex). Each row already carries `external_source`
    /// and `external_id` so re-imports dedupe via the UNIQUE index.
    pub trades: Vec<Trade>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub inserted: i64,
    pub updated: i64,
    pub failed: i64,
}

/// Bulk upsert pre-parsed trades. One write transaction per row (cheap
/// thanks to WAL); failures are counted but don't abort the run. The
/// frontend is expected to set `external_source` (e.g. "apex") and a
/// stable `external_id` so the unique index keeps the operation
/// idempotent.
#[tauri::command]
pub async fn journal_import_trades(
    state: State<'_, JournalState>,
    args: ImportTradesArgs,
) -> Result<ImportResult, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let mut inserted = 0i64;
        let mut updated = 0i64;
        let mut failed = 0i64;
        for trade in args.trades {
            match db.upsert_trade_external(trade) {
                Ok((_, true)) => inserted += 1,
                Ok((_, false)) => updated += 1,
                Err(e) => {
                    tracing::warn!("journal_import_trades: upsert failed: {}", e);
                    failed += 1;
                }
            }
        }
        Ok(ImportResult {
            inserted,
            updated,
            failed,
        })
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))?
}

#[tauri::command]
pub async fn journal_rithmic_sync_status(
    state: State<'_, JournalState>,
) -> Result<SyncStatus, String> {
    let db = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let last_imported_at = db
            .last_external_entry_time(crate::journal::rithmic_sync::SOURCE_NAME)
            .map_err(|e| e.to_string())?;
        // Quick count via list_trades with a synthetic filter would be
        // overkill; we go straight to a one-row query.
        let filter = crate::journal::TradeFilter::default();
        let imported_count = if last_imported_at.is_some() {
            // Cheap proxy: count rows in the trades table that came from
            // rithmic. Reusing count_trades + filter would require a new
            // filter field, so we just hit the DB directly.
            db.count_external_trades(crate::journal::rithmic_sync::SOURCE_NAME)
                .map_err(|e| e.to_string())?
        } else {
            0
        };
        let _ = filter;
        Ok(SyncStatus {
            imported_count,
            last_imported_at,
        })
    })
    .await
    .map_err(|e| format!("task join failed: {e}"))?
}
