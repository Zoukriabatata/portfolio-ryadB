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
