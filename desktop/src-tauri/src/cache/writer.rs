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
            // Fold the WAL back into the main DB and TRUNCATE the WAL file
            // so it can't grow unbounded. Without this it ballooned to
            // 2.5 GB during bridge history bursts and thrashed the disk
            // system-wide. The cache uses ONE shared connection, so there
            // is never a concurrent reader to block the TRUNCATE.
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
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
