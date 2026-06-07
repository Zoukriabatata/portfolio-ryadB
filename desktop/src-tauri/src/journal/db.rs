//! Journal SQLite database layer.
//!
//! Single-file DB stored under the Tauri-managed app-data directory
//! (Windows: `%APPDATA%/com.orderflowv2/journal.db`). Schema mirrors
//! the website's Prisma `JournalEntry` model 1:1 except:
//!   • `userId` column dropped — desktop app is single-user
//!   • CUID2 generation done in Rust via `uuid::Uuid::new_v4` (the
//!     prefix differs from CUIDs but the role is identical: opaque
//!     stable string id). Both sides treat the id as a black box.

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Current migration version. Bump + add a new arm in `migrate()` when
// the schema changes; older versions get walked forward.
const SCHEMA_VERSION: i64 = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    pub id: String,
    pub symbol: String,
    pub side: String, // "LONG" | "SHORT"
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub quantity: i32,
    pub pnl: Option<f64>,
    pub entry_time: String, // ISO 8601 UTC string
    pub exit_time: Option<String>,
    pub timeframe: Option<String>,
    pub setup: Option<String>,
    pub tags: Option<String>, // JSON array string
    pub notes: Option<String>,
    pub rating: Option<i32>,
    pub emotions: Option<String>,
    pub screenshot_url: Option<String>,
    pub screenshot_urls: Vec<String>,
    pub playbook_setup_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// "manual" (default) or "rithmic" / future broker ids — auto-imported
    /// trades are flagged so the UI can show a "synced" badge and lock
    /// the price/qty/time fields from edits.
    #[serde(default)]
    pub external_source: Option<String>,
    /// Stable upstream id for dedupe (Rithmic exchange_order_id, etc.).
    /// UNIQUE(external_source, external_id) lets us re-run a sync
    /// without creating duplicate rows.
    #[serde(default)]
    pub external_id: Option<String>,
    /// Broker account this fill belongs to (Apex account number, etc.).
    /// Useful when the user trades multiple Apex accounts (PA / eval / funded).
    #[serde(default)]
    pub account_id: Option<String>,
    /// Total commission paid on the round-trip (entry + exit fills),
    /// already applied to `pnl` for closed trades.
    #[serde(default)]
    pub commission: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeFilter {
    pub symbol: Option<String>,
    pub side: Option<String>,
    pub setup: Option<String>,
    pub timeframe: Option<String>,
    /// ISO 8601 UTC; trades with entry_time >= from are kept.
    pub from: Option<String>,
    /// ISO 8601 UTC; trades with entry_time <= to are kept.
    pub to: Option<String>,
    /// "win" | "loss" | "open" — filter on pnl side.
    pub outcome: Option<String>,
    /// Free-text search over notes + setup + symbol.
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookSetup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// Free-text checklist / criteria, line-separated.
    pub criteria: Option<String>,
    /// Optional reference image (URL or `file://` path).
    pub image_url: Option<String>,
    /// User-defined tag color (hex). Defaults to Senzoukria green.
    pub color: Option<String>,
    /// "win" rate target the user is aiming for, 0..100.
    pub target_win_rate: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyNote {
    pub id: String,
    /// "YYYY-MM-DD" — unique per date.
    pub date: String,
    pub premarket_plan: Option<String>,
    pub end_of_day_review: Option<String>,
    pub lessons: Option<String>,
    /// 1..10
    pub mood: Option<i32>,
    pub market_conditions: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    /// "YYYY-MM-DD"
    pub date: String,
    pub pnl: f64,
    pub trade_count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMonthStats {
    pub total_pnl: f64,
    pub trading_days: i64,
    pub winning_days: i64,
    pub losing_days: i64,
    pub best_day: f64,
    pub worst_day: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeStats {
    pub total_trades: i64,
    pub win_count: i64,
    pub loss_count: i64,
    pub open_count: i64,
    pub total_pnl: f64,
    pub win_rate: f64, // 0..100
    pub avg_win: f64,
    pub avg_loss: f64,
    pub best_trade: f64,
    pub worst_trade: f64,
}

pub struct JournalDb {
    inner: Mutex<Connection>,
}

impl JournalDb {
    /// Acquire the connection lock, recovering gracefully from lock poisoning.
    /// A poisoned lock (caused by a panic inside a previous lock holder) is
    /// recovered by taking the inner value — SQLite connections tolerate this.
    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn open(path: PathBuf) -> SqlResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(path)?;
        // SQLite tuning that matters for journal-style workloads:
        //   • WAL → concurrent reads while writing, durable on crash
        //   • foreign_keys → enforce playbook setup links when added
        //   • synchronous=NORMAL → fast-enough fsync (full would be
        //     a lot for small writes; NORMAL is safe with WAL)
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; \
             PRAGMA synchronous=NORMAL; \
             PRAGMA foreign_keys=ON;",
        )?;
        let db = Self {
            inner: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> SqlResult<()> {
        let conn = self.conn();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (\
                version INTEGER PRIMARY KEY)",
            [],
        )?;
        let current: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if current < 1 {
            tracing::info!("journal: applying migration v1 (trades table)");
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS trades (\
                    id              TEXT PRIMARY KEY, \
                    symbol          TEXT NOT NULL, \
                    side            TEXT NOT NULL, \
                    entry_price     REAL NOT NULL, \
                    exit_price      REAL, \
                    quantity        INTEGER NOT NULL DEFAULT 1, \
                    pnl             REAL, \
                    entry_time      TEXT NOT NULL, \
                    exit_time       TEXT, \
                    timeframe       TEXT, \
                    setup           TEXT, \
                    tags            TEXT, \
                    notes           TEXT, \
                    rating          INTEGER, \
                    emotions        TEXT, \
                    screenshot_url  TEXT, \
                    screenshot_urls TEXT NOT NULL DEFAULT '[]', \
                    playbook_setup_id TEXT, \
                    created_at      TEXT NOT NULL, \
                    updated_at      TEXT NOT NULL\
                ); \
                CREATE INDEX IF NOT EXISTS idx_trades_symbol     ON trades(symbol); \
                CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time); \
                CREATE INDEX IF NOT EXISTS idx_trades_setup      ON trades(setup);",
            )?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![1],
            )?;
        }
        if current < 2 {
            tracing::info!("journal: applying migration v2 (daily_notes table)");
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS daily_notes (\
                    id                 TEXT PRIMARY KEY, \
                    date               TEXT NOT NULL UNIQUE, \
                    premarket_plan     TEXT, \
                    end_of_day_review  TEXT, \
                    lessons            TEXT, \
                    mood               INTEGER, \
                    market_conditions  TEXT, \
                    created_at         TEXT NOT NULL, \
                    updated_at         TEXT NOT NULL\
                ); \
                CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date);",
            )?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![2],
            )?;
        }
        if current < 3 {
            // v3 — broker import support. Adds external_source / external_id
            // / account_id / commission so trades can be deduplicated across
            // Rithmic syncs and the UI can render a "synced from broker"
            // badge. Existing rows get NULL for all four columns (= manual).
            tracing::info!("journal: applying migration v3 (broker import columns)");
            conn.execute_batch(
                "ALTER TABLE trades ADD COLUMN external_source TEXT; \
                 ALTER TABLE trades ADD COLUMN external_id     TEXT; \
                 ALTER TABLE trades ADD COLUMN account_id      TEXT; \
                 ALTER TABLE trades ADD COLUMN commission      REAL; \
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_external \
                    ON trades(external_source, external_id) \
                    WHERE external_source IS NOT NULL AND external_id IS NOT NULL; \
                 CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);",
            )?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![3],
            )?;
        }
        if current < 4 {
            tracing::info!("journal: applying migration v4 (playbook_setups table)");
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS playbook_setups (\
                    id               TEXT PRIMARY KEY, \
                    name             TEXT NOT NULL, \
                    description      TEXT, \
                    criteria         TEXT, \
                    image_url        TEXT, \
                    color            TEXT, \
                    target_win_rate  REAL, \
                    created_at       TEXT NOT NULL, \
                    updated_at       TEXT NOT NULL\
                ); \
                CREATE INDEX IF NOT EXISTS idx_playbook_name ON playbook_setups(name);",
            )?;
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                params![4],
            )?;
        }
        // Future migrations: add `if current < 5 { ... }` blocks here.
        let _ = SCHEMA_VERSION;
        Ok(())
    }

    // ── Broker import (Rithmic Order Plant, etc.) ─────────────────────────

    /// Insert a trade if no row exists with the same (external_source,
    /// external_id) tuple — otherwise update the existing row in place.
    /// Returns `(Trade, was_inserted)`. The bool is true on first sight,
    /// false when an existing row was refreshed — lets the sync layer
    /// report inserted vs updated counts without a second SELECT.
    /// Used by the Rithmic sync to be safely re-runnable: pulling the
    /// last 30 days of fills twice will not produce duplicates.
    pub fn upsert_trade_external(&self, mut t: Trade) -> SqlResult<(Trade, bool)> {
        let now = chrono_now();
        if t.id.is_empty() {
            t.id = Uuid::new_v4().to_string();
        }
        if t.created_at.is_empty() {
            t.created_at = now.clone();
        }
        t.updated_at = now;
        let conn = self.conn();

        // First try INSERT. If the unique index trips, fall through to
        // UPDATE keyed on (external_source, external_id) so the user's
        // own annotations (setup, tags, notes, rating, emotions) are
        // preserved across re-syncs.
        let inserted = conn.execute(
            "INSERT OR IGNORE INTO trades (\
                id, symbol, side, entry_price, exit_price, quantity, pnl, \
                entry_time, exit_time, timeframe, setup, tags, notes, \
                rating, emotions, screenshot_url, screenshot_urls, \
                playbook_setup_id, created_at, updated_at, \
                external_source, external_id, account_id, commission) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)",
            params![
                t.id, t.symbol, t.side, t.entry_price, t.exit_price, t.quantity, t.pnl,
                t.entry_time, t.exit_time, t.timeframe, t.setup, t.tags, t.notes,
                t.rating, t.emotions, t.screenshot_url,
                serde_json::to_string(&t.screenshot_urls).unwrap_or_else(|_| "[]".into()),
                t.playbook_setup_id, t.created_at, t.updated_at,
                t.external_source, t.external_id, t.account_id, t.commission,
            ],
        )?;
        if inserted == 0 {
            // Existing row: refresh broker-owned fields only. Hand-edited
            // fields (setup, tags, notes, rating, emotions, screenshots)
            // are deliberately left untouched.
            conn.execute(
                "UPDATE trades SET \
                    symbol=?1, side=?2, entry_price=?3, exit_price=?4, quantity=?5, pnl=?6, \
                    entry_time=?7, exit_time=?8, account_id=?9, commission=?10, updated_at=?11 \
                 WHERE external_source=?12 AND external_id=?13",
                params![
                    t.symbol,
                    t.side,
                    t.entry_price,
                    t.exit_price,
                    t.quantity,
                    t.pnl,
                    t.entry_time,
                    t.exit_time,
                    t.account_id,
                    t.commission,
                    t.updated_at,
                    t.external_source,
                    t.external_id,
                ],
            )?;
        }
        // Re-read so the caller gets the canonical id (insert may have
        // been ignored, in which case t.id is the freshly-generated one
        // that was thrown away).
        let saved = conn.query_row(
            "SELECT * FROM trades WHERE external_source=?1 AND external_id=?2",
            params![t.external_source, t.external_id],
            row_to_trade,
        )?;
        Ok((saved, inserted > 0))
    }

    /// Latest entry_time across all trades imported from the given source.
    /// Used to do incremental syncs (only fetch fills newer than this).
    pub fn last_external_entry_time(&self, source: &str) -> SqlResult<Option<String>> {
        let conn = self.conn();
        conn.query_row(
            "SELECT MAX(entry_time) FROM trades WHERE external_source=?1",
            params![source],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map(|o| o.flatten())
    }

    /// Count of trades flagged with `external_source = source`. Used by
    /// the sync-status command to show "X trades synced from Rithmic"
    /// in the UI without paginating the full list.
    pub fn count_external_trades(&self, source: &str) -> SqlResult<i64> {
        let conn = self.conn();
        conn.query_row(
            "SELECT COUNT(*) FROM trades WHERE external_source=?1",
            params![source],
            |r| r.get(0),
        )
    }

    // ── Playbook setups (Day 3) ───────────────────────────────────────────

    pub fn upsert_playbook_setup(&self, mut s: PlaybookSetup) -> SqlResult<PlaybookSetup> {
        let now = chrono_now();
        if s.id.is_empty() {
            s.id = Uuid::new_v4().to_string();
        }
        if s.created_at.is_empty() {
            s.created_at = now.clone();
        }
        s.updated_at = now;
        let conn = self.conn();
        conn.execute(
            "INSERT INTO playbook_setups (\
                id, name, description, criteria, image_url, color, \
                target_win_rate, created_at, updated_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) \
             ON CONFLICT(id) DO UPDATE SET \
                name             = excluded.name, \
                description      = excluded.description, \
                criteria         = excluded.criteria, \
                image_url        = excluded.image_url, \
                color            = excluded.color, \
                target_win_rate  = excluded.target_win_rate, \
                updated_at       = excluded.updated_at",
            params![
                s.id,
                s.name,
                s.description,
                s.criteria,
                s.image_url,
                s.color,
                s.target_win_rate,
                s.created_at,
                s.updated_at,
            ],
        )?;
        let saved = conn.query_row(
            "SELECT * FROM playbook_setups WHERE id=?1",
            params![s.id],
            row_to_playbook,
        )?;
        Ok(saved)
    }

    pub fn delete_playbook_setup(&self, id: &str) -> SqlResult<usize> {
        let conn = self.conn();
        conn.execute("DELETE FROM playbook_setups WHERE id=?1", params![id])
    }

    pub fn list_playbook_setups(&self) -> SqlResult<Vec<PlaybookSetup>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT * FROM playbook_setups ORDER BY name ASC")?;
        let rows = stmt.query_map([], row_to_playbook)?;
        rows.collect()
    }

    // ── Daily notes ───────────────────────────────────────────────────────

    pub fn upsert_daily_note(&self, mut n: DailyNote) -> SqlResult<DailyNote> {
        let now = chrono_now();
        if n.id.is_empty() {
            n.id = Uuid::new_v4().to_string();
        }
        if n.created_at.is_empty() {
            n.created_at = now.clone();
        }
        n.updated_at = now;
        let conn = self.conn();
        // Upsert keyed on `date`: editing the same day overwrites instead
        // of stacking notes — mirrors the website's behaviour where a
        // day has at most one note.
        conn.execute(
            "INSERT INTO daily_notes (\
                id, date, premarket_plan, end_of_day_review, lessons, \
                mood, market_conditions, created_at, updated_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) \
             ON CONFLICT(date) DO UPDATE SET \
                premarket_plan    = excluded.premarket_plan, \
                end_of_day_review = excluded.end_of_day_review, \
                lessons           = excluded.lessons, \
                mood              = excluded.mood, \
                market_conditions = excluded.market_conditions, \
                updated_at        = excluded.updated_at",
            params![
                n.id,
                n.date,
                n.premarket_plan,
                n.end_of_day_review,
                n.lessons,
                n.mood,
                n.market_conditions,
                n.created_at,
                n.updated_at,
            ],
        )?;
        // Re-read to get the stable id when an existing date got updated.
        let saved = conn.query_row(
            "SELECT * FROM daily_notes WHERE date=?1",
            params![n.date],
            row_to_daily_note,
        )?;
        Ok(saved)
    }

    pub fn delete_daily_note(&self, id: &str) -> SqlResult<usize> {
        let conn = self.conn();
        conn.execute("DELETE FROM daily_notes WHERE id=?1", params![id])
    }

    /// List daily notes for a given month "YYYY-MM" (newest day first).
    pub fn list_daily_notes_month(&self, month: &str) -> SqlResult<Vec<DailyNote>> {
        let from = format!("{}-01", month);
        let to = format!("{}-31", month);
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM daily_notes \
             WHERE date >= ?1 AND date <= ?2 \
             ORDER BY date DESC",
        )?;
        let rows = stmt.query_map(params![from, to], row_to_daily_note)?;
        rows.collect()
    }

    // ── Calendar (trades aggregate per day) ───────────────────────────────

    /// Return per-day P&L + trade count for the given month "YYYY-MM",
    /// plus aggregate month stats.
    pub fn calendar_month(&self, month: &str) -> SqlResult<(Vec<CalendarDay>, CalendarMonthStats)> {
        let from = format!("{}-01T00:00:00Z", month);
        let to = format!("{}-31T23:59:59Z", month);
        let conn = self.conn();

        let mut stmt = conn.prepare(
            "SELECT substr(entry_time, 1, 10) AS d, \
                    COALESCE(SUM(pnl), 0.0)   AS pnl, \
                    COUNT(*)                  AS n \
             FROM trades \
             WHERE entry_time >= ?1 AND entry_time <= ?2 \
             GROUP BY d \
             ORDER BY d",
        )?;
        let rows = stmt.query_map(params![from, to], |r| {
            Ok(CalendarDay {
                date: r.get(0)?,
                pnl: r.get(1)?,
                trade_count: r.get(2)?,
            })
        })?;
        let days: Vec<CalendarDay> = rows.collect::<SqlResult<_>>()?;

        let mut stats = CalendarMonthStats::default();
        for d in &days {
            stats.total_pnl += d.pnl;
            stats.trading_days += 1;
            if d.pnl > 0.0 {
                stats.winning_days += 1;
            } else if d.pnl < 0.0 {
                stats.losing_days += 1;
            }
            if d.pnl > stats.best_day {
                stats.best_day = d.pnl;
            }
            if d.pnl < stats.worst_day {
                stats.worst_day = d.pnl;
            }
        }
        Ok((days, stats))
    }

    /// All trades for a single day "YYYY-MM-DD" (used by CalendarDaySummary).
    pub fn trades_on_day(&self, date: &str) -> SqlResult<Vec<Trade>> {
        let from = format!("{}T00:00:00Z", date);
        let to = format!("{}T23:59:59Z", date);
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT * FROM trades \
             WHERE entry_time >= ?1 AND entry_time <= ?2 \
             ORDER BY entry_time ASC",
        )?;
        let rows = stmt.query_map(params![from, to], row_to_trade)?;
        rows.collect()
    }

    pub fn create_trade(&self, mut t: Trade) -> SqlResult<Trade> {
        let now = chrono_now();
        if t.id.is_empty() {
            t.id = Uuid::new_v4().to_string();
        }
        if t.created_at.is_empty() {
            t.created_at = now.clone();
        }
        t.updated_at = now;
        let conn = self.conn();
        conn.execute(
            "INSERT INTO trades (\
                id, symbol, side, entry_price, exit_price, quantity, pnl, \
                entry_time, exit_time, timeframe, setup, tags, notes, \
                rating, emotions, screenshot_url, screenshot_urls, \
                playbook_setup_id, created_at, updated_at, \
                external_source, external_id, account_id, commission) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)",
            params![
                t.id, t.symbol, t.side, t.entry_price, t.exit_price, t.quantity, t.pnl,
                t.entry_time, t.exit_time, t.timeframe, t.setup, t.tags, t.notes,
                t.rating, t.emotions, t.screenshot_url,
                serde_json::to_string(&t.screenshot_urls).unwrap_or_else(|_| "[]".into()),
                t.playbook_setup_id, t.created_at, t.updated_at,
                t.external_source, t.external_id, t.account_id, t.commission,
            ],
        )?;
        Ok(t)
    }

    pub fn update_trade(&self, t: Trade) -> SqlResult<Trade> {
        let mut updated = t.clone();
        updated.updated_at = chrono_now();
        let conn = self.conn();
        conn.execute(
            "UPDATE trades SET \
                symbol=?2, side=?3, entry_price=?4, exit_price=?5, quantity=?6, pnl=?7, \
                entry_time=?8, exit_time=?9, timeframe=?10, setup=?11, tags=?12, notes=?13, \
                rating=?14, emotions=?15, screenshot_url=?16, screenshot_urls=?17, \
                playbook_setup_id=?18, updated_at=?19, commission=?20 \
             WHERE id=?1",
            params![
                updated.id,
                updated.symbol,
                updated.side,
                updated.entry_price,
                updated.exit_price,
                updated.quantity,
                updated.pnl,
                updated.entry_time,
                updated.exit_time,
                updated.timeframe,
                updated.setup,
                updated.tags,
                updated.notes,
                updated.rating,
                updated.emotions,
                updated.screenshot_url,
                serde_json::to_string(&updated.screenshot_urls).unwrap_or_else(|_| "[]".into()),
                updated.playbook_setup_id,
                updated.updated_at,
                updated.commission,
            ],
        )?;
        Ok(updated)
    }

    pub fn delete_trade(&self, id: &str) -> SqlResult<usize> {
        let conn = self.conn();
        conn.execute("DELETE FROM trades WHERE id=?1", params![id])
    }

    pub fn delete_trades_bulk(&self, ids: &[String]) -> SqlResult<usize> {
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.conn();
        let placeholders = (1..=ids.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("DELETE FROM trades WHERE id IN ({placeholders})");
        let params_iter: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        conn.execute(&sql, params_iter.as_slice())
    }

    pub fn get_trade(&self, id: &str) -> SqlResult<Option<Trade>> {
        let conn = self.conn();
        conn.query_row(
            "SELECT * FROM trades WHERE id=?1",
            params![id],
            row_to_trade,
        )
        .optional()
    }

    pub fn list_trades(&self, filter: &TradeFilter) -> SqlResult<Vec<Trade>> {
        let (where_sql, params) = build_filter_sql(filter);
        let limit = filter.limit.unwrap_or(50);
        let offset = filter.offset.unwrap_or(0);
        let sql = format!(
            "SELECT * FROM trades {where_sql} \
             ORDER BY entry_time DESC \
             LIMIT {limit} OFFSET {offset}"
        );
        let conn = self.conn();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), row_to_trade)?;
        rows.collect()
    }

    /// Total count for the filter (used for pagination).
    pub fn count_trades(&self, filter: &TradeFilter) -> SqlResult<i64> {
        let (where_sql, params) = build_filter_sql(filter);
        let sql = format!("SELECT COUNT(*) FROM trades {where_sql}");
        let conn = self.conn();
        conn.query_row(&sql, rusqlite::params_from_iter(params.iter()), |r| {
            r.get(0)
        })
    }

    /// Aggregate stats over the filtered set (ignoring limit/offset).
    pub fn stats(&self, filter: &TradeFilter) -> SqlResult<TradeStats> {
        let (where_sql, params) = build_filter_sql(filter);
        let conn = self.conn();
        let sql = format!(
            "SELECT \
                COUNT(*)                                                             AS n, \
                COALESCE(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END), 0)                AS wins, \
                COALESCE(SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END), 0)                AS losses, \
                COALESCE(SUM(CASE WHEN pnl IS NULL OR exit_price IS NULL THEN 1 ELSE 0 END), 0) AS opens, \
                COALESCE(SUM(pnl), 0.0)                                              AS total_pnl, \
                COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0.0)                   AS avg_win, \
                COALESCE(AVG(CASE WHEN pnl < 0 THEN pnl END), 0.0)                   AS avg_loss, \
                COALESCE(MAX(pnl), 0.0)                                              AS best, \
                COALESCE(MIN(pnl), 0.0)                                              AS worst \
             FROM trades {where_sql}"
        );
        let mut stats = conn.query_row(&sql, rusqlite::params_from_iter(params.iter()), |r| {
            Ok(TradeStats {
                total_trades: r.get(0)?,
                win_count: r.get(1)?,
                loss_count: r.get(2)?,
                open_count: r.get(3)?,
                total_pnl: r.get(4)?,
                win_rate: 0.0,
                avg_win: r.get(5)?,
                avg_loss: r.get(6)?,
                best_trade: r.get(7)?,
                worst_trade: r.get(8)?,
            })
        })?;
        let closed = stats.win_count + stats.loss_count;
        if closed > 0 {
            stats.win_rate = (stats.win_count as f64 / closed as f64) * 100.0;
        }
        Ok(stats)
    }
}

fn row_to_playbook(row: &rusqlite::Row) -> SqlResult<PlaybookSetup> {
    Ok(PlaybookSetup {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        criteria: row.get("criteria")?,
        image_url: row.get("image_url")?,
        color: row.get("color")?,
        target_win_rate: row.get("target_win_rate")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_daily_note(row: &rusqlite::Row) -> SqlResult<DailyNote> {
    Ok(DailyNote {
        id: row.get("id")?,
        date: row.get("date")?,
        premarket_plan: row.get("premarket_plan")?,
        end_of_day_review: row.get("end_of_day_review")?,
        lessons: row.get("lessons")?,
        mood: row.get("mood")?,
        market_conditions: row.get("market_conditions")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_trade(row: &rusqlite::Row) -> SqlResult<Trade> {
    let urls_json: String = row.get("screenshot_urls").unwrap_or_else(|_| "[]".into());
    let screenshot_urls: Vec<String> = serde_json::from_str(&urls_json).unwrap_or_default();
    Ok(Trade {
        id: row.get("id")?,
        symbol: row.get("symbol")?,
        side: row.get("side")?,
        entry_price: row.get("entry_price")?,
        exit_price: row.get("exit_price")?,
        quantity: row.get("quantity")?,
        pnl: row.get("pnl")?,
        entry_time: row.get("entry_time")?,
        exit_time: row.get("exit_time")?,
        timeframe: row.get("timeframe")?,
        setup: row.get("setup")?,
        tags: row.get("tags")?,
        notes: row.get("notes")?,
        rating: row.get("rating")?,
        emotions: row.get("emotions")?,
        screenshot_url: row.get("screenshot_url")?,
        screenshot_urls,
        playbook_setup_id: row.get("playbook_setup_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        // v3 columns: NULL on rows imported before the migration ran.
        external_source: row.get("external_source").ok(),
        external_id: row.get("external_id").ok(),
        account_id: row.get("account_id").ok(),
        commission: row.get("commission").ok(),
    })
}

fn build_filter_sql(filter: &TradeFilter) -> (String, Vec<rusqlite::types::Value>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(s) = &filter.symbol {
        clauses.push("symbol = ?".into());
        params.push(s.clone().into());
    }
    if let Some(s) = &filter.side {
        clauses.push("side = ?".into());
        params.push(s.clone().into());
    }
    if let Some(s) = &filter.setup {
        clauses.push("setup = ?".into());
        params.push(s.clone().into());
    }
    if let Some(s) = &filter.timeframe {
        clauses.push("timeframe = ?".into());
        params.push(s.clone().into());
    }
    if let Some(s) = &filter.from {
        clauses.push("entry_time >= ?".into());
        params.push(s.clone().into());
    }
    if let Some(s) = &filter.to {
        clauses.push("entry_time <= ?".into());
        params.push(s.clone().into());
    }
    match filter.outcome.as_deref() {
        Some("win") => clauses.push("pnl > 0".into()),
        Some("loss") => clauses.push("pnl < 0".into()),
        Some("open") => clauses.push("(pnl IS NULL OR exit_price IS NULL)".into()),
        _ => {}
    }
    if let Some(q) = &filter.query {
        let like = format!("%{}%", q);
        clauses.push("(notes LIKE ? OR setup LIKE ? OR symbol LIKE ?)".into());
        params.push(like.clone().into());
        params.push(like.clone().into());
        params.push(like.into());
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    (where_sql, params)
}

/// Public mirror of `chrono_now` so other journal modules (e.g. the
/// Rithmic sync orchestrator) can stamp `created_at` consistently
/// without re-implementing the conversion.
pub fn chrono_now_pub() -> String {
    chrono_now()
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // RFC 3339 in UTC. We don't bring in chrono to avoid the dep weight.
    let (y, mo, d, h, mi, s) = unix_to_ymdhms(secs as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, mi, s)
}

/// Converts a Unix epoch seconds value to UTC (year, month, day, h, m, s).
/// Self-contained algorithm — no external time crate needed for serialising
/// `created_at`/`updated_at` columns.
fn unix_to_ymdhms(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400) as i64;
    let rem = secs.rem_euclid(86_400) as u32;
    let h = rem / 3600;
    let mi = (rem % 3600) / 60;
    let s = rem % 60;
    // Civil-from-days, Howard Hinnant's algorithm.
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if mo <= 2 { y + 1 } else { y };
    (year, mo, d, h, mi, s)
}
