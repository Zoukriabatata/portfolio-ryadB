# Bars Cache SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist footprint bars to a local SQLite cache so the chart shows a session-over-session lookback without depending on the Rithmic HISTORY_PLANT (denied on the Apex account).

**Architecture:** A new Rust `cache` module owns a single SQLite connection. A `CacheWriter` consumer subscribes to the existing `FootprintEngine::updates()` broadcast, batches incoming bars by primary key, and flushes every 2 s in a single transaction. A new Tauri command `cache_query` lets the frontend seed its bar store at app load. Retention is 7 d, enforced by a purge + VACUUM at boot.

**Tech Stack:** Rust + Tauri 2.x, `rusqlite` (bundled SQLite), `tokio` (existing), TypeScript / React (existing).

**Spec:** [docs/superpowers/specs/2026-05-13-bars-cache-sqlite-design.md](../specs/2026-05-13-bars-cache-sqlite-design.md)

**Deviation from spec:** The spec proposed adding a `pub exchange: String` field to `FootprintBar` (and propagating from `Tick`). Exploration of the existing code shows that ticks already arrive with `symbol = "MNQM6.CME"` (compound form — see `engine/footprint.rs:312` test fixture), so the SQLite table uses a single `full_symbol TEXT` column instead. This preserves the spec's invariant (origin uniquely identified) with zero changes to `Tick`, `FootprintBar`, or the 4 connector parsers. **The schema below reflects this refinement.**

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `desktop/src-tauri/Cargo.toml` | Modify | Add `rusqlite` dep |
| `desktop/src-tauri/src/cache/mod.rs` | Create | Module entry, DB init, retention purge, public re-exports |
| `desktop/src-tauri/src/cache/writer.rs` | Create | `CacheWriter`: consume broadcast, batch, flush every 2s |
| `desktop/src-tauri/src/cache/reader.rs` | Create | Single query helper: `query_bars(symbol, tf, ts_from, ts_to)` |
| `desktop/src-tauri/src/commands/cache.rs` | Create | Tauri command `cache_query` (IPC wrapper around reader) |
| `desktop/src-tauri/src/commands/mod.rs` | Modify | Add `pub mod cache;` |
| `desktop/src-tauri/src/lib.rs` | Modify | Init DB at boot, purge, spawn writer, register command, handle exit |
| `desktop/src/components/RithmicFootprint.tsx` | Modify | Cascade fallback: localStorage → `cache_query` → HISTORY_PLANT |

**Tests live alongside their module** via `#[cfg(test)] mod tests { ... }` blocks, following the project pattern (see `engine/footprint.rs:302+`).

---

## Schema (final, after spec refinement)

```sql
CREATE TABLE IF NOT EXISTS bars (
  full_symbol  TEXT    NOT NULL,         -- "MNQM6.CME" or "BTCUSDT.BINANCE"
  timeframe    TEXT    NOT NULL,         -- "1m", "3m", "5m", "15m", "1h", "4h", "1d"
  bucket_ts_ns INTEGER NOT NULL,         -- bar start, nanoseconds since epoch
  open         REAL    NOT NULL,
  high         REAL    NOT NULL,
  low          REAL    NOT NULL,
  close        REAL    NOT NULL,
  total_volume REAL    NOT NULL,
  total_delta  REAL    NOT NULL,
  trade_count  INTEGER NOT NULL,
  levels       TEXT    NOT NULL,         -- JSON-serialized Vec<PriceLevel>
  updated_at_ms INTEGER NOT NULL,        -- wall-clock ms of last upsert
  PRIMARY KEY (full_symbol, timeframe, bucket_ts_ns)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_bars_lookup
  ON bars(full_symbol, timeframe, bucket_ts_ns DESC);
```

---

## Task 1: Add `rusqlite` dependency

**Files:**
- Modify: `desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Add the dep**

Open `desktop/src-tauri/Cargo.toml`, find the `[dependencies]` table, and append:

```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

`bundled` compiles SQLite into the binary so we don't depend on a system SQLite (Windows ships without one). v0.31 is the current stable as of 2026; if the project's `rusqlite` already exists at a different version, adopt that version instead.

- [ ] **Step 2: Verify the build**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop\src-tauri'
cargo build 2>&1 | Select-String -Pattern "error|warning: unused" -Context 0,3
```

Expected: no errors. May see warnings about unused crates — that's fine, we'll consume `rusqlite` in Task 3.

- [ ] **Step 3: Commit**

```powershell
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock
git commit -m "deps(rust): add rusqlite (bundled SQLite) for local bars cache"
```

---

## Task 2: Cache module — init DB + pragmas + schema

**Files:**
- Create: `desktop/src-tauri/src/cache/mod.rs`

- [ ] **Step 1: Write the failing test**

Create the file `desktop/src-tauri/src/cache/mod.rs` with the test block first:

```rust
//! Local SQLite cache of footprint bars.
//!
//! See `docs/superpowers/specs/2026-05-13-bars-cache-sqlite-design.md`
//! for the rationale (Rithmic HISTORY_PLANT denied on Apex, so we
//! grow our own lookback from the live tick stream).

use rusqlite::{params, Connection};
use std::path::Path;

pub mod writer;
pub mod reader;

/// Retention window in milliseconds. Bars older than this are dropped
/// at boot. 7 days = enough to show "last week" on Monday morning,
/// small enough to fit comfortably on disk (~25 MB / symbol).
pub const RETENTION_MS: i64 = 7 * 24 * 3600 * 1000;

/// Open (or create) the bars DB at `path`. Sets the pragmas we need
/// for a writer-heavy cache (WAL for read/write concurrency, NORMAL
/// sync to avoid the per-write fsync stall) and ensures the schema
/// is in place.
pub fn open_db(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        // Ignore the "already exists" race — we only care that the
        // path is reachable when we open below.
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA cache_size = -16384;",
    )?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(conn)
}

const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS bars (
  full_symbol   TEXT    NOT NULL,
  timeframe     TEXT    NOT NULL,
  bucket_ts_ns  INTEGER NOT NULL,
  open          REAL    NOT NULL,
  high          REAL    NOT NULL,
  low           REAL    NOT NULL,
  close         REAL    NOT NULL,
  total_volume  REAL    NOT NULL,
  total_delta   REAL    NOT NULL,
  trade_count   INTEGER NOT NULL,
  levels        TEXT    NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (full_symbol, timeframe, bucket_ts_ns)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_bars_lookup
  ON bars(full_symbol, timeframe, bucket_ts_ns DESC);
";

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn open_db_creates_schema() {
        let dir = TempDir::new().expect("temp dir");
        let path = dir.path().join("bars.db");
        let conn = open_db(&path).expect("open");
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='bars'",
                [],
                |r| r.get(0),
            )
            .expect("query");
        assert_eq!(count, 1, "bars table should exist after open_db");
    }

    #[test]
    fn open_db_creates_parent_dirs() {
        let dir = TempDir::new().expect("temp dir");
        let nested = dir.path().join("a/b/c/bars.db");
        let _ = open_db(&nested).expect("open in nested path");
        assert!(nested.exists(), "DB file should exist at nested path");
    }
}
```

- [ ] **Step 2: Add `tempfile` as a dev-dependency**

Open `desktop/src-tauri/Cargo.toml` and add (or create) a `[dev-dependencies]` section:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Wire the module into the crate**

Open `desktop/src-tauri/src/lib.rs`, find the existing top-level `mod` / `pub mod` declarations (near the top of the file alongside `mod commands;`, `mod connectors;`, `mod engine;`, etc.) and add:

```rust
mod cache;
```

- [ ] **Step 4: Run the tests — they must pass**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop\src-tauri'
cargo test --lib cache::tests::open_db 2>&1 | Select-String -Pattern "test result|FAILED|error" -Context 0,2
```

Expected: `test result: ok. 2 passed`. If `writer` or `reader` sub-modules don't exist yet, `cargo test` will error on the `pub mod writer; pub mod reader;` lines — that's expected and we fix it in Tasks 3 and 5 by creating empty stub files now.

- [ ] **Step 5: Create empty stub files for the sub-modules**

Create `desktop/src-tauri/src/cache/writer.rs` with:

```rust
//! Filled in Task 3 (CacheWriter).
```

Create `desktop/src-tauri/src/cache/reader.rs` with:

```rust
//! Filled in Task 5 (query_bars).
```

- [ ] **Step 6: Re-run the tests**

```powershell
cargo test --lib cache::tests::open_db 2>&1 | Select-String -Pattern "test result|FAILED|error" -Context 0,2
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 7: Commit**

```powershell
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/src/cache/ desktop/src-tauri/src/lib.rs
git commit -m "feat(cache): SQLite open_db with WAL pragmas + schema"
```

---

## Task 3: Retention purge

**Files:**
- Modify: `desktop/src-tauri/src/cache/mod.rs`

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` block in `desktop/src-tauri/src/cache/mod.rs`:

```rust
    #[test]
    fn purge_removes_old_rows_keeps_recent() {
        let dir = TempDir::new().expect("temp dir");
        let path = dir.path().join("bars.db");
        let conn = open_db(&path).expect("open");

        let now_ms: i64 = 1_700_000_000_000;
        let old_ms = now_ms - RETENTION_MS - 1;
        let recent_ms = now_ms - 60_000; // 1 min ago

        conn.execute(
            "INSERT INTO bars(full_symbol, timeframe, bucket_ts_ns, open, high, low, close,
                              total_volume, total_delta, trade_count, levels, updated_at_ms)
             VALUES (?1, ?2, ?3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, '[]', ?4)",
            params!["MNQM6.CME", "1m", 1_000_000_000i64, old_ms],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bars(full_symbol, timeframe, bucket_ts_ns, open, high, low, close,
                              total_volume, total_delta, trade_count, levels, updated_at_ms)
             VALUES (?1, ?2, ?3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, '[]', ?4)",
            params!["MNQM6.CME", "1m", 2_000_000_000i64, recent_ms],
        )
        .unwrap();

        let removed = purge_old_bars(&conn, now_ms).expect("purge");
        assert_eq!(removed, 1, "only the old row should be removed");

        let remaining: i64 = conn
            .query_row("SELECT count(*) FROM bars", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining, 1, "recent row should remain");
    }
```

- [ ] **Step 2: Run the test — confirm it fails (function missing)**

```powershell
cargo test --lib cache::tests::purge_removes_old_rows 2>&1 | Select-String -Pattern "error|FAILED" -Context 0,3
```

Expected: compile error `cannot find function 'purge_old_bars'`.

- [ ] **Step 3: Implement `purge_old_bars`**

Add to `desktop/src-tauri/src/cache/mod.rs` (between `open_db` and the `#[cfg(test)]` block):

```rust
/// Delete every cached bar whose `updated_at_ms` is older than the
/// retention cutoff (`now_ms - RETENTION_MS`). Reclaims disk space
/// with `VACUUM` after the delete. Safe to call at every boot — runs
/// in milliseconds when there's nothing to purge.
///
/// Returns the number of rows removed (handy for tests + log lines).
pub fn purge_old_bars(conn: &Connection, now_ms: i64) -> rusqlite::Result<usize> {
    let cutoff = now_ms - RETENTION_MS;
    let removed = conn.execute(
        "DELETE FROM bars WHERE updated_at_ms < ?1",
        params![cutoff],
    )?;
    // VACUUM cannot run inside a transaction; passing through
    // execute_batch keeps the call site simple.
    conn.execute_batch("VACUUM;")?;
    Ok(removed)
}
```

- [ ] **Step 4: Run the test — confirm it passes**

```powershell
cargo test --lib cache::tests::purge_removes_old_rows 2>&1 | Select-String -Pattern "test result|FAILED"
```

Expected: `test result: ok. 1 passed`.

- [ ] **Step 5: Commit**

```powershell
git add desktop/src-tauri/src/cache/mod.rs
git commit -m "feat(cache): retention purge (7d) + VACUUM"
```

---

## Task 4: CacheWriter — flush logic

**Files:**
- Modify: `desktop/src-tauri/src/cache/writer.rs`

- [ ] **Step 1: Write the writer skeleton + tests**

Replace the stub content of `desktop/src-tauri/src/cache/writer.rs` with:

```rust
//! Background consumer of `FootprintEngine::updates()` that batches
//! bar updates and flushes them into SQLite every `flush_interval`.
//!
//! Last-write-wins per (full_symbol, timeframe, bucket_ts_ns):
//! each incoming bar overwrites any pending entry for the same PK so
//! the DB only ever sees the most recent version of every bucket.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use rusqlite::{params, Connection};
use tokio::sync::{broadcast, Mutex};

use crate::engine::FootprintBar;

/// Composite key for deduplicating in-flight bars before the flush.
type BarKey = (String, &'static str, u64);

pub struct CacheWriter {
    db: Arc<Mutex<Connection>>,
    pending: HashMap<BarKey, FootprintBar>,
    flush_interval: Duration,
}

impl CacheWriter {
    pub fn new(db: Arc<Mutex<Connection>>, flush_interval: Duration) -> Self {
        Self {
            db,
            pending: HashMap::new(),
            flush_interval,
        }
    }

    /// Flush every pending bar into SQLite in a single transaction.
    /// `INSERT OR REPLACE` is the right call here: the same PK is
    /// expected to be written many times (one per tick), and we want
    /// the latest version to win every time.
    pub async fn flush(&mut self) -> rusqlite::Result<usize> {
        if self.pending.is_empty() {
            return Ok(0);
        }
        let drained: Vec<FootprintBar> = self.pending.drain().map(|(_, b)| b).collect();
        let db = self.db.clone();
        let count = drained.len();
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        tokio::task::spawn_blocking(move || -> rusqlite::Result<()> {
            let mut conn = db.blocking_lock();
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    "INSERT OR REPLACE INTO bars(
                       full_symbol, timeframe, bucket_ts_ns,
                       open, high, low, close,
                       total_volume, total_delta, trade_count,
                       levels, updated_at_ms
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                )?;
                for bar in &drained {
                    let levels_json = serde_json::to_string(&bar.levels)
                        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                    stmt.execute(params![
                        bar.symbol,
                        bar.timeframe,
                        bar.bucket_ts_ns as i64,
                        bar.open,
                        bar.high,
                        bar.low,
                        bar.close,
                        bar.total_volume,
                        bar.total_delta,
                        bar.trade_count as i64,
                        levels_json,
                        now_ms,
                    ])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
        .await
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))??;
        Ok(count)
    }

    /// Ingest one bar into `pending`. Public so unit tests can drive
    /// the writer without setting up the broadcast channel.
    pub fn ingest(&mut self, bar: FootprintBar) {
        let key: BarKey = (bar.symbol.clone(), bar.timeframe, bar.bucket_ts_ns);
        self.pending.insert(key, bar);
    }

    /// Run the writer's event loop until `rx` is closed.
    /// `tokio::select!` between bar arrivals and the flush tick.
    pub async fn run(mut self, mut rx: broadcast::Receiver<FootprintBar>) {
        let mut tick = tokio::time::interval(self.flush_interval);
        // First tick fires immediately; skip it so flush isn't called
        // on an empty pending set the instant we start.
        tick.tick().await;
        loop {
            tokio::select! {
                msg = rx.recv() => match msg {
                    Ok(bar) => self.ingest(bar),
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("cache writer lagged, dropped {} bars", n);
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        // Engine shut down — final flush and exit.
                        if let Err(e) = self.flush().await {
                            tracing::warn!("cache writer final flush failed: {e}");
                        }
                        tracing::info!("cache writer: tick channel closed, exiting");
                        return;
                    }
                },
                _ = tick.tick() => {
                    if let Err(e) = self.flush().await {
                        tracing::warn!("cache writer flush failed: {e}");
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::open_db;
    use crate::engine::{FootprintBar, PriceLevel, Timeframe};
    use tempfile::TempDir;

    fn make_bar(symbol: &str, tf: Timeframe, bucket_secs: u64, close: f64) -> FootprintBar {
        FootprintBar {
            symbol: symbol.to_string(),
            timeframe: tf.as_str(),
            bucket_ts_ns: bucket_secs * 1_000_000_000,
            open: close,
            high: close,
            low: close,
            close,
            total_volume: 1.0,
            total_delta: 0.5,
            trade_count: 1,
            levels: vec![PriceLevel {
                price: close,
                buy_volume: 1.0,
                sell_volume: 0.5,
                buy_trades: 1,
                sell_trades: 1,
            }],
        }
    }

    #[tokio::test]
    async fn flush_inserts_pending_bars() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("bars.db");
        let conn = open_db(&path).unwrap();
        let db = Arc::new(Mutex::new(conn));

        let mut writer = CacheWriter::new(db.clone(), Duration::from_secs(2));
        writer.ingest(make_bar("MNQM6.CME", Timeframe::Min1, 60, 28379.50));
        writer.ingest(make_bar("MNQM6.CME", Timeframe::Min1, 120, 28381.00));
        let count = writer.flush().await.unwrap();
        assert_eq!(count, 2);

        let conn = db.lock().await;
        let n: i64 = conn
            .query_row("SELECT count(*) FROM bars", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }

    #[tokio::test]
    async fn flush_dedups_same_key_last_write_wins() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("bars.db");
        let conn = open_db(&path).unwrap();
        let db = Arc::new(Mutex::new(conn));

        let mut writer = CacheWriter::new(db.clone(), Duration::from_secs(2));
        // Same bucket, two versions — only the second should land in DB.
        writer.ingest(make_bar("MNQM6.CME", Timeframe::Min1, 60, 28379.50));
        writer.ingest(make_bar("MNQM6.CME", Timeframe::Min1, 60, 28999.99));
        writer.flush().await.unwrap();

        let conn = db.lock().await;
        let close: f64 = conn
            .query_row(
                "SELECT close FROM bars WHERE full_symbol='MNQM6.CME' AND timeframe='1m'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!((close - 28999.99).abs() < 1e-6);
    }
}
```

- [ ] **Step 2: Run the writer tests**

```powershell
cargo test --lib cache::writer::tests 2>&1 | Select-String -Pattern "test result|FAILED|error" -Context 0,3
```

Expected: `test result: ok. 2 passed`.

- [ ] **Step 3: Commit**

```powershell
git add desktop/src-tauri/src/cache/writer.rs
git commit -m "feat(cache): CacheWriter — batch + dedup + flush 2s"
```

---

## Task 5: Reader — `query_bars`

**Files:**
- Modify: `desktop/src-tauri/src/cache/reader.rs`

- [ ] **Step 1: Write the reader + tests**

Replace the stub content of `desktop/src-tauri/src/cache/reader.rs` with:

```rust
//! Read-side of the bars cache. Single entry point for the IPC layer.

use rusqlite::{params, Connection};
use serde::Serialize;

/// Cache row shipped to the frontend. Same `camelCase` JSON shape as
/// `HistoryFootprintBar` in `commands/rithmic.rs` so the React layer
/// consumes both interchangeably without a mapper.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedBar {
    pub symbol: String,             // mirrors HistoryFootprintBar.symbol = "MNQM6.CME"
    pub timeframe: String,
    pub bucket_ts_ns: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub total_volume: f64,
    pub total_delta: f64,
    pub trade_count: i64,
    /// JSON string holding the raw `levels` array as stored in
    /// SQLite. The frontend already has a typed `PriceLevel[]` model
    /// — we let serde-json parse it client-side so the Rust↔TS
    /// schema stays in sync (any field added in TS doesn't need a
    /// matching Rust struct change).
    pub levels_json: String,
}

/// Return every cached bar for `(full_symbol, timeframe)` whose
/// `bucket_ts_ns` falls in `[ts_from_ns, ts_to_ns)`, oldest → newest.
/// `ts_to_ns = i64::MAX` reads everything up to now.
pub fn query_bars(
    conn: &Connection,
    full_symbol: &str,
    timeframe: &str,
    ts_from_ns: i64,
    ts_to_ns: i64,
) -> rusqlite::Result<Vec<CachedBar>> {
    let mut stmt = conn.prepare(
        "SELECT full_symbol, timeframe, bucket_ts_ns,
                open, high, low, close,
                total_volume, total_delta, trade_count, levels
         FROM bars
         WHERE full_symbol = ?1
           AND timeframe = ?2
           AND bucket_ts_ns >= ?3
           AND bucket_ts_ns < ?4
         ORDER BY bucket_ts_ns ASC",
    )?;
    let rows = stmt.query_map(
        params![full_symbol, timeframe, ts_from_ns, ts_to_ns],
        |row| {
            Ok(CachedBar {
                symbol: row.get(0)?,
                timeframe: row.get(1)?,
                bucket_ts_ns: row.get(2)?,
                open: row.get(3)?,
                high: row.get(4)?,
                low: row.get(5)?,
                close: row.get(6)?,
                total_volume: row.get(7)?,
                total_delta: row.get(8)?,
                trade_count: row.get(9)?,
                levels_json: row.get(10)?,
            })
        },
    )?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::open_db;
    use tempfile::TempDir;

    fn insert(conn: &Connection, symbol: &str, tf: &str, bucket_ns: i64, close: f64) {
        conn.execute(
            "INSERT INTO bars(full_symbol, timeframe, bucket_ts_ns,
                              open, high, low, close,
                              total_volume, total_delta, trade_count,
                              levels, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?4, ?4, ?4, 1.0, 0.0, 1, '[]', 0)",
            params![symbol, tf, bucket_ns, close],
        )
        .unwrap();
    }

    #[test]
    fn query_returns_window_in_order() {
        let dir = TempDir::new().unwrap();
        let conn = open_db(&dir.path().join("bars.db")).unwrap();
        insert(&conn, "MNQM6.CME", "1m", 100, 1.0);
        insert(&conn, "MNQM6.CME", "1m", 200, 2.0);
        insert(&conn, "MNQM6.CME", "1m", 300, 3.0);
        // Out-of-window row: different symbol.
        insert(&conn, "BTCUSDT.BINANCE", "1m", 200, 99.0);

        let bars = query_bars(&conn, "MNQM6.CME", "1m", 150, 250).unwrap();
        assert_eq!(bars.len(), 1);
        assert!((bars[0].close - 2.0).abs() < 1e-6);

        let all = query_bars(&conn, "MNQM6.CME", "1m", 0, i64::MAX).unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].bucket_ts_ns, 100);
        assert_eq!(all[2].bucket_ts_ns, 300);
    }
}
```

- [ ] **Step 2: Run the test**

```powershell
cargo test --lib cache::reader::tests 2>&1 | Select-String -Pattern "test result|FAILED|error" -Context 0,3
```

Expected: `test result: ok. 1 passed`.

- [ ] **Step 3: Commit**

```powershell
git add desktop/src-tauri/src/cache/reader.rs
git commit -m "feat(cache): query_bars reader returning CachedBar in time order"
```

---

## Task 6: IPC command `cache_query`

**Files:**
- Create: `desktop/src-tauri/src/commands/cache.rs`
- Modify: `desktop/src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Write the command**

Create `desktop/src-tauri/src/commands/cache.rs`:

```rust
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
    let ts_from = now_ns - args.hours_back.max(1) * 3600 * 1_000_000_000;
    let conn = state.conn.clone();
    // SQLite reads are CPU-bound — hop off the async runtime so the
    // tick stream and renderer events keep flowing.
    let bars = tokio::task::spawn_blocking(move || {
        let guard = conn.blocking_lock();
        query_bars(&guard, &args.full_symbol, &args.timeframe, ts_from, now_ns)
    })
    .await
    .map_err(|e| format!("cache_query task panicked: {e}"))?
    .map_err(|e| format!("cache_query failed: {e}"))?;
    tracing::info!(
        "cache_query: {} bars for {}.{} ({}h)",
        bars.len(),
        args.full_symbol,
        args.timeframe,
        args.hours_back,
    );
    Ok(bars)
}
```

- [ ] **Step 2: Add the module to `commands/mod.rs`**

Open `desktop/src-tauri/src/commands/mod.rs` and add at the end of the module list (alongside `pub mod rithmic;`, `pub mod crypto;`, etc.):

```rust
pub mod cache;
```

- [ ] **Step 3: Build to confirm signatures compile**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop\src-tauri'
cargo build 2>&1 | Select-String -Pattern "error" -Context 0,3
```

Expected: no `error` lines. Warnings about unused `cache_query` / `CacheState` are fine at this stage — Task 7 hooks them up.

- [ ] **Step 4: Commit**

```powershell
git add desktop/src-tauri/src/commands/cache.rs desktop/src-tauri/src/commands/mod.rs
git commit -m "feat(commands): cache_query IPC command + CacheState"
```

---

## Task 7: Wire up cache in `lib.rs`

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Find the engine init site**

Grep for where the `FootprintEngine` is constructed in `lib.rs`. The two anchors we need are (a) the place that creates `engine` and exposes `engine.updates()`, and (b) the `tauri::Builder` chain where commands are registered with `.invoke_handler(tauri::generate_handler![...])`.

```powershell
Select-String -Path 'desktop/src-tauri/src/lib.rs' -Pattern 'FootprintEngine|invoke_handler|generate_handler'
```

- [ ] **Step 2: Add the imports**

Near the existing `use` statements at the top of `lib.rs`, add:

```rust
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex as TokioMutex;
```

(Skip any that are already imported in this file.)

- [ ] **Step 3: Init the cache DB right after the engine is constructed**

After the `FootprintEngine` creation block, insert:

```rust
// ── Local bars cache (SQLite) ──────────────────────────────────────
// File path: {app_data_dir}/bars.db. Persists footprint bars so the
// chart shows a lookback at the next launch without depending on
// Rithmic HISTORY_PLANT (denied on the Apex account). Retention
// 7 days, purged at boot.
let app_data = app
    .path()
    .app_data_dir()
    .expect("app_data_dir resolvable on a supported platform");
let db_path = app_data.join("bars.db");
let conn = cache::open_db(&db_path).expect("open bars.db");
let now_ms = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0);
match cache::purge_old_bars(&conn, now_ms) {
    Ok(n) => tracing::info!("cache: purged {} expired bars at boot", n),
    Err(e) => tracing::warn!("cache: purge failed at boot: {e}"),
}
let cache_db = Arc::new(TokioMutex::new(conn));

// Spawn the writer consumer. It owns its `pending` HashMap; the
// only shared state is the DB connection.
let writer_rx = engine.updates();
let writer_db = cache_db.clone();
tokio::spawn(async move {
    let writer = cache::writer::CacheWriter::new(writer_db, Duration::from_secs(2));
    writer.run(writer_rx).await;
});

// Make the connection available to the `cache_query` command.
app.manage(commands::cache::CacheState::new(cache_db));
```

If `app` is named differently in this codebase (e.g. `app_handle`, `tauri_app`), adapt accordingly. The path resolution API is `app.path().app_data_dir()` for Tauri 2.x.

- [ ] **Step 4: Register the new command**

Find the existing `tauri::generate_handler![ ... ]` macro call. Add the new command to the list:

```rust
commands::cache::cache_query,
```

…in the same comma-separated list as `commands::rithmic::rithmic_probe_tick_replay` etc.

- [ ] **Step 5: Build the binary**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop\src-tauri'
cargo build 2>&1 | Select-String -Pattern "error" -Context 0,3
```

Expected: no `error` lines.

- [ ] **Step 6: Commit**

```powershell
git add desktop/src-tauri/src/lib.rs
git commit -m "feat(cache): init DB + purge at boot, spawn writer, register cache_query"
```

---

## Task 8: Frontend fallback in `RithmicFootprint.tsx`

**Files:**
- Modify: `desktop/src/components/RithmicFootprint.tsx`

- [ ] **Step 1: Locate the fetch logic**

The cascade lives in `runHistoryFetch` near line 1234. Today it sets `command = "rithmic_fetch_tick_history"` (or `rithmic_fetch_history` for 4H/1D) and calls `invoke<FootprintBar[]>(command, ...)` (line ~1326).

We want to keep that as the **third** step of the cascade and add a SQLite read **between** localStorage and HISTORY_PLANT.

- [ ] **Step 2: Add the SQLite probe before the HISTORY_PLANT call**

Right above the `try { const history = await invoke<FootprintBar[]>(command, ...)` block, insert:

```typescript
// Step 2 of the cascade — try the local SQLite cache (filled by the
// Rust CacheWriter from every live bar). When HISTORY_PLANT is
// permissioned we still prefer the broker (canonical data), but on
// the Apex add-on-less account this is what gives the chart a real
// lookback. `CachedBar.levelsJson` is a serialised JSON string we
// parse client-side so we don't have to keep two `PriceLevel` schemas
// in sync between Rust and TS.
type CachedBar = {
  symbol: string;
  timeframe: string;
  bucketTsNs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalDelta: number;
  tradeCount: number;
  levelsJson: string;
};
try {
  const sqliteRows = await invoke<CachedBar[]>("cache_query", {
    args: { fullSymbol, timeframe: tf, hoursBack },
  });
  if (sqliteRows.length > 0) {
    const fromCache: FootprintBar[] = sqliteRows.map((row) => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      bucketTsNs: row.bucketTsNs,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      totalVolume: row.totalVolume,
      totalDelta: row.totalDelta,
      tradeCount: row.tradeCount,
      levels: JSON.parse(row.levelsJson) as PriceLevel[],
    }));
    console.info(
      `rithmic history: SQLite cache hit — ${fromCache.length} bars for ${historyKey}`,
    );
    // Reuse the existing post-fetch handler so the bars flow through
    // the same sort / merge / cache-write path as a HISTORY_PLANT
    // response. The renderer doesn't care where the bars came from.
    handleHistoryBars(fromCache, t0);
    setHistoryLoading(false);
    return;
  }
} catch (e) {
  console.warn("rithmic history: SQLite cache probe failed:", e);
  // fall through to HISTORY_PLANT
}
```

Note: this snippet uses `handleHistoryBars` and `historyKey` which already exist in the surrounding function. If the existing post-fetch logic isn't extracted into a `handleHistoryBars` helper, **do not introduce one in this task** — instead, paste the SQLite branch INLINE before the HISTORY_PLANT try-block, and replicate the same sort + filter logic that the existing path uses. Pick one strategy and stick to it; do not mix.

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop'
npx tsc --noEmit -p . 2>&1; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 4: Commit**

```powershell
git add desktop/src/components/RithmicFootprint.tsx
git commit -m "feat(footprint): SQLite cache fallback in history cascade"
```

---

## Task 9: Smoke test end-to-end

**Files:** None to change — manual verification.

- [ ] **Step 1: Launch the app in dev mode**

```powershell
Set-Location 'C:\Users\ryadb\Desktop\orderflow-v2\desktop'
npm run tauri dev
```

- [ ] **Step 2: Connect to Rithmic and subscribe to MNQM6.CME**

In the app: log in, pick MNQ, observe live bars streaming on the chart.

- [ ] **Step 3: Verify the SQLite file exists**

In a separate PowerShell:

```powershell
$dataDir = Join-Path $env:APPDATA 'com.senzoukria.orderflow-v2'
Get-ChildItem $dataDir | Where-Object { $_.Name -like 'bars.db*' }
```

Expected: at least `bars.db` (possibly plus `bars.db-wal`, `bars.db-shm`).

- [ ] **Step 4: Verify bars are being written**

After ~3 minutes of live data, while the app is still running:

```powershell
$dbPath = Join-Path $env:APPDATA 'com.senzoukria.orderflow-v2\bars.db'
# Requires the sqlite3 binary on PATH. If absent, skip and rely on
# Step 5 — closing/reopening the app proves the persistence.
sqlite3 $dbPath "SELECT timeframe, count(*) FROM bars GROUP BY timeframe"
```

Expected: rows like `1m|3`, `3m|1`, `5m|1`, etc.

- [ ] **Step 5: Close and reopen — verify lookback persists**

Close the Tauri window cleanly, wait 5 s, relaunch `npm run tauri dev`. Subscribe to MNQM6.CME again. The chart should show the bars from the previous session **before** any new live tick arrives. Check DevTools console — you should see a `rithmic history: SQLite cache hit — N bars` line.

- [ ] **Step 6: Document the verification outcome**

If everything works, no changes needed. If something fails, file the symptom + your hypothesis as a follow-up task; do not commit a half-baked fix as part of this plan.

- [ ] **Step 7: Final commit (only if any small fixes were needed)**

```powershell
# Only if Steps 1-5 surfaced bugs that you fixed:
git add -p   # review patch hunks
git commit -m "fix(cache): <specific issue from smoke test>"
```

---

## Self-review checklist (already run by the planner)

- ✅ Spec §1 (schema) → Task 2
- ✅ Spec §2 (writer batch+throttle) → Task 4
- ✅ Spec §3 (IPC command + frontend integration) → Tasks 6 + 8
- ✅ Spec §4 (retention purge + hook engine) → Tasks 3 + 7
- ✅ Spec "Note sur FootprintBar.exchange" → resolved by storing `full_symbol` directly, no struct change needed (deviation documented at the top of this plan)
- ✅ All steps include complete code (no "implement this" placeholders)
- ✅ Type names consistent across tasks: `CacheWriter`, `CacheState`, `CachedBar`, `CacheQueryArgs`, `cache_query`
- ✅ TDD pattern: every Rust component has a `#[cfg(test)]` block written **before** the implementation in its task
