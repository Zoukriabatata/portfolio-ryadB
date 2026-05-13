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
}
