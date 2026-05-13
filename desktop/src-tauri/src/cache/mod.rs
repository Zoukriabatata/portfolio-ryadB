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
