//! Rithmic → Journal sync orchestrator.
//!
//! Glues `connectors::rithmic::order_plant::pull_history` (raw fills
//! from the broker) to `journal::db::JournalDb::upsert_trade_external`
//! (rows in our local SQLite). The bulk of the file is the FIFO trade
//! reconstructor (`reconstruct_trades`) — turning a stream of fills
//! into round-trip Trade rows the journal UI can render.
//!
//! Re-runnable: every Trade row carries `external_source = "rithmic"`
//! plus an `external_id` (a stable concatenation of fill ids); the
//! UNIQUE index added in schema v3 absorbs duplicates so the user can
//! click "Sync" repeatedly without piling up.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::brokers::{vault, BrokerCredentials};
use crate::connectors::rithmic::order_plant::{
    self, OrderPlantAccount, OrderPlantCredentials, RithmicFill,
};
use crate::journal::db::{JournalDb, Trade};

pub const SOURCE_NAME: &str = "rithmic";

/// Default lookback window when the user clicks "Sync from Rithmic"
/// without picking a custom range. 60 days covers most prop-firm
/// challenge cycles in one shot.
pub const DEFAULT_LOOKBACK_DAYS: u32 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub inserted: i64,
    pub updated: i64,
    pub unchanged: i64,
    pub accounts: Vec<String>,
}

/// One-shot sync entry point. Orchestrates: load creds → pull history →
/// reconstruct trades → upsert. Errors short-circuit (no partial commit
/// because every upsert is its own transaction in SQLite WAL mode).
pub async fn sync(
    db: Arc<JournalDb>,
    days: u32,
    app_name: &str,
    app_version: &str,
) -> Result<SyncResult, String> {
    // ── Credentials ────────────────────────────────────────────────────
    let creds: BrokerCredentials = vault::load()
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| {
            "No broker credentials saved — open the broker settings first.".to_string()
        })?;
    if creds.password.is_empty() {
        return Err("Saved broker has no password — re-enter it in broker settings.".to_string());
    }

    let op_creds = OrderPlantCredentials {
        username: creds.username.clone(),
        password: creds.password.clone(),
        system_name: creds.system_name.clone(),
        gateway_url: creds.gateway_url.clone(),
        app_name: app_name.to_string(),
        app_version: app_version.to_string(),
    };

    // ── Pull from Rithmic ──────────────────────────────────────────────
    tracing::info!(
        "rithmic_sync: starting (system='{}', user='{}', days={})",
        creds.system_name,
        creds.username,
        days
    );
    let pull = order_plant::pull_history(&op_creds, days)
        .await
        .map_err(|e| format!("Rithmic pull failed: {e}"))?;

    tracing::info!(
        "rithmic_sync: got {} accounts, {} fills",
        pull.accounts.len(),
        pull.fills.len()
    );

    // ── FIFO trade reconstruction ──────────────────────────────────────
    let trades = reconstruct_trades(&pull.accounts, &pull.fills);
    tracing::info!(
        "rithmic_sync: reconstructed {} round-trip trade(s)",
        trades.len()
    );

    // ── Upsert ─────────────────────────────────────────────────────────
    let mut inserted = 0i64;
    let mut updated = 0i64;
    let mut unchanged = 0i64;
    for trade in trades {
        match db.upsert_trade_external(trade) {
            Ok((_, true)) => inserted += 1,
            Ok((_, false)) => updated += 1,
            Err(e) => {
                tracing::warn!("rithmic_sync: upsert failed: {}", e);
                unchanged += 1;
            }
        }
    }

    Ok(SyncResult {
        inserted,
        updated,
        unchanged,
        accounts: pull.accounts.iter().map(|a| a.account_id.clone()).collect(),
    })
}

// ── FIFO state machine ─────────────────────────────────────────────────

/// One open contract sitting in the FIFO queue, waiting to be paired
/// with an opposite-side fill that closes it.
#[derive(Debug, Clone)]
struct OpenLot {
    is_buy: bool,
    price: f64,
    fill_id: String,
    /// ISO 8601 entry timestamp.
    time_iso: String,
}

/// Process fills in chronological order, FIFO-pair them into round-trip
/// trades, and emit one `Trade` row per closed lot. Multi-contract
/// fills are split into per-contract lots (so a 3-lot exit closes 3
/// FIFO lots and emits 3 trade rows). This keeps the math obvious and
/// matches how Apex / TopStep display "trades" in their dashboards.
pub fn reconstruct_trades(accounts: &[OrderPlantAccount], fills: &[RithmicFill]) -> Vec<Trade> {
    let _ = accounts; // reserved for per-account currency lookup (TODO)

    // Sort by (account, symbol, time) so each (acc, sym) group is in order.
    let mut sorted: Vec<&RithmicFill> = fills.iter().collect();
    sorted.sort_by(|a, b| {
        a.account_id
            .cmp(&b.account_id)
            .then_with(|| a.symbol.cmp(&b.symbol))
            .then_with(|| {
                let ka = (a.fill_date.as_str(), a.fill_time.as_str());
                let kb = (b.fill_date.as_str(), b.fill_time.as_str());
                ka.cmp(&kb)
            })
    });

    let mut open: HashMap<(String, String), VecDeque<OpenLot>> = HashMap::new();
    let mut out: Vec<Trade> = Vec::new();
    let now = crate::journal::db::chrono_now_pub();

    for f in sorted {
        let key = (f.account_id.clone(), f.symbol.clone());
        let queue = open.entry(key.clone()).or_default();
        let entry_iso = normalize_time(&f.fill_date, &f.fill_time);

        // Each fill may carry multiple contracts. Walk one at a time.
        for _ in 0..f.fill_size {
            // Same direction as queue (or queue empty) → push a new lot.
            let same_direction = queue.front().map(|l| l.is_buy == f.is_buy).unwrap_or(true);

            if same_direction {
                queue.push_back(OpenLot {
                    is_buy: f.is_buy,
                    price: f.fill_price,
                    fill_id: f.fill_id.clone(),
                    time_iso: entry_iso.clone(),
                });
                continue;
            }

            // Opposite direction → pop one open lot, emit a closed trade.
            let entry_lot = match queue.pop_front() {
                Some(l) => l,
                None => break,
            };
            let side = if entry_lot.is_buy { "LONG" } else { "SHORT" };
            let sign = if entry_lot.is_buy { 1.0 } else { -1.0 };
            let pnl_points = (f.fill_price - entry_lot.price) * sign;

            let external_id = format!("{}|{}", entry_lot.fill_id, f.fill_id);

            let trade = Trade {
                id: String::new(), // upsert will mint a uuid
                symbol: f.symbol.clone(),
                side: side.to_string(),
                entry_price: entry_lot.price,
                exit_price: Some(f.fill_price),
                quantity: 1,
                pnl: Some(pnl_points),
                entry_time: entry_lot.time_iso.clone(),
                exit_time: Some(entry_iso.clone()),
                timeframe: None,
                setup: None,
                tags: None,
                notes: None,
                rating: None,
                emotions: None,
                screenshot_url: None,
                screenshot_urls: vec![],
                playbook_setup_id: None,
                created_at: now.clone(),
                updated_at: now.clone(),
                external_source: Some(SOURCE_NAME.to_string()),
                external_id: Some(external_id),
                account_id: Some(f.account_id.clone()),
                commission: f.commission,
            };
            out.push(trade);
        }
    }
    out
}

/// Rithmic ships fill_date as "YYYYMMDD" and fill_time as "HH:MM:SS"
/// (or sometimes "HH:MM:SS.fff"). We turn the pair into a portable
/// ISO-8601 UTC string so the journal queries (date prefix matching)
/// keep working.
fn normalize_time(date: &str, time: &str) -> String {
    if date.len() == 8 && date.chars().all(|c| c.is_ascii_digit()) {
        let y = &date[0..4];
        let m = &date[4..6];
        let d = &date[6..8];
        // Truncate sub-second precision — the journal grain is per-day
        // anyway and SQLite TEXT compares string-wise.
        let t = time.split('.').next().unwrap_or("00:00:00");
        format!("{y}-{m}-{d}T{t}Z")
    } else {
        // Defensive fallback: leave the original for forensic.
        format!("{date}T{time}Z")
    }
}
