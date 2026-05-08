//! Footprint aggregation.
//!
//! A footprint bar is a candle (OHLC + volume) augmented with a per-
//! price-level breakdown of buy vs sell aggressor volume. It's the
//! workhorse view for orderflow analysis: instead of just "the bar
//! closed up 3 points", you see which prices absorbed liquidity, where
//! the delta flipped, and where buyers / sellers stepped in.
//!
//! Implementation:
//!  - Bars are keyed by `(symbol, timeframe, bucket_secs)` in a
//!    `BTreeMap` so iteration is naturally chronological per
//!    (symbol, timeframe).
//!  - Each tick lands in every configured timeframe bucket; the engine
//!    re-emits the updated bar through a `broadcast::Sender` so the
//!    UI / IPC layer can re-render incrementally.
//!  - Price levels are kept as a sorted `Vec<PriceLevel>` per bar.
//!    Lookup is linear, but typical bars carry < 50 unique levels and
//!    insert is rare relative to update — fine for our throughput.

use std::collections::BTreeMap;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;

use crate::connectors::tick::{Side, Tick};

/// Capacity of the broadcast channel that fans out updated bars to
/// downstream consumers (Tauri IPC, tests, …). 1024 is generous —
/// individual receivers should drain faster than ticks arrive.
const UPDATE_CHANNEL_CAPACITY: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Timeframe {
    Sec1,
    Sec5,
    Sec15,
    Sec30,
    Min1,
    Min3,
    Min5,
    Min15,
    Min30,
    Hour1,
}

impl Timeframe {
    pub fn duration_secs(&self) -> u64 {
        match self {
            Timeframe::Sec1 => 1,
            Timeframe::Sec5 => 5,
            Timeframe::Sec15 => 15,
            Timeframe::Sec30 => 30,
            Timeframe::Min1 => 60,
            Timeframe::Min3 => 180,
            Timeframe::Min5 => 300,
            Timeframe::Min15 => 900,
            Timeframe::Min30 => 1800,
            Timeframe::Hour1 => 3600,
        }
    }

    /// Short label used wherever the timeframe is serialized into
    /// JSON (Tauri events, snapshots).
    pub fn as_str(&self) -> &'static str {
        match self {
            Timeframe::Sec1 => "1s",
            Timeframe::Sec5 => "5s",
            Timeframe::Sec15 => "15s",
            Timeframe::Sec30 => "30s",
            Timeframe::Min1 => "1m",
            Timeframe::Min3 => "3m",
            Timeframe::Min5 => "5m",
            Timeframe::Min15 => "15m",
            Timeframe::Min30 => "30m",
            Timeframe::Hour1 => "1h",
        }
    }

    /// The bucket (in seconds since epoch) a given nanosecond
    /// timestamp falls into for this timeframe.
    pub fn bucket_secs(&self, ts_ns: u64) -> u64 {
        let ts_secs = ts_ns / 1_000_000_000;
        let dur = self.duration_secs();
        (ts_secs / dur) * dur
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct PriceLevel {
    pub price: f64,
    pub buy_volume: f64,
    pub sell_volume: f64,
    pub buy_trades: u32,
    pub sell_trades: u32,
}

impl PriceLevel {
    pub fn total_volume(&self) -> f64 {
        self.buy_volume + self.sell_volume
    }

    pub fn delta(&self) -> f64 {
        self.buy_volume - self.sell_volume
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FootprintBar {
    pub symbol: String,
    pub timeframe: &'static str,
    pub bucket_ts_ns: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub total_volume: f64,
    pub total_delta: f64,
    pub trade_count: u32,
    /// Sorted ascending by price.
    pub levels: Vec<PriceLevel>,
}

impl FootprintBar {
    fn new(symbol: String, timeframe: Timeframe, bucket_secs: u64, seed_price: f64) -> Self {
        Self {
            symbol,
            timeframe: timeframe.as_str(),
            bucket_ts_ns: bucket_secs * 1_000_000_000,
            open: seed_price,
            high: seed_price,
            low: seed_price,
            close: seed_price,
            total_volume: 0.0,
            total_delta: 0.0,
            trade_count: 0,
            levels: Vec::new(),
        }
    }

    fn apply_tick(&mut self, tick: &Tick, rounded_price: f64) {
        if tick.price > self.high {
            self.high = tick.price;
        }
        if tick.price < self.low {
            self.low = tick.price;
        }
        self.close = tick.price;
        self.trade_count += 1;
        self.total_volume += tick.qty;

        let level = match self
            .levels
            .iter()
            .position(|l| (l.price - rounded_price).abs() < f64::EPSILON)
        {
            Some(idx) => &mut self.levels[idx],
            None => {
                self.levels.push(PriceLevel {
                    price: rounded_price,
                    ..Default::default()
                });
                // Maintain ascending price order. Linear sort is fine
                // because new levels are rare per tick.
                self.levels
                    .sort_by(|a, b| a.price.partial_cmp(&b.price).expect("non-NaN price"));
                let idx = self
                    .levels
                    .iter()
                    .position(|l| (l.price - rounded_price).abs() < f64::EPSILON)
                    .expect("level we just inserted");
                &mut self.levels[idx]
            }
        };

        match tick.side {
            Side::Buy => {
                level.buy_volume += tick.qty;
                level.buy_trades += 1;
                self.total_delta += tick.qty;
            }
            Side::Sell => {
                level.sell_volume += tick.qty;
                level.sell_trades += 1;
                self.total_delta -= tick.qty;
            }
        }
    }
}

/// Engine that turns a tick stream into footprint bars. Cheap to
/// share — `Arc<FootprintEngine>` exposes both the input task spawn
/// and the read-side (`updates()`, `get_bars()`) without any further
/// wrapping.
pub struct FootprintEngine {
    bars: Mutex<BTreeMap<(String, Timeframe, u64), FootprintBar>>,
    timeframes: Vec<Timeframe>,
    tick_size: f64,
    update_tx: broadcast::Sender<FootprintBar>,
}

impl FootprintEngine {
    pub fn new(timeframes: Vec<Timeframe>, tick_size: f64) -> Self {
        assert!(tick_size > 0.0, "tick_size must be positive");
        let (update_tx, _) = broadcast::channel(UPDATE_CHANNEL_CAPACITY);
        Self {
            bars: Mutex::new(BTreeMap::new()),
            timeframes,
            tick_size,
            update_tx,
        }
    }

    /// Subscribe to live "bar updated" events. Each event is the full
    /// bar after the tick was applied; consumers can replace their
    /// view of `(symbol, timeframe, bucket_ts_ns)` with the new
    /// payload.
    pub fn updates(&self) -> broadcast::Receiver<FootprintBar> {
        self.update_tx.subscribe()
    }

    /// Spawn the background task that drains a `Tick` receiver into
    /// the engine. Returns the JoinHandle so callers can decide
    /// whether to await it or ignore it.
    pub fn spawn(self: Arc<Self>, tick_rx: broadcast::Receiver<Tick>) -> JoinHandle<()> {
        tokio::spawn(async move {
            run_engine(self, tick_rx).await;
        })
    }

    /// Get the last `n` bars for `(symbol, timeframe)` in chronological
    /// (oldest → newest) order.
    pub async fn get_bars(
        &self,
        symbol: &str,
        timeframe: Timeframe,
        n: usize,
    ) -> Vec<FootprintBar> {
        let bars = self.bars.lock().await;
        let mut tail: Vec<FootprintBar> = bars
            .iter()
            .filter(|((s, t, _), _)| s == symbol && *t == timeframe)
            .rev()
            .take(n)
            .map(|(_, b)| b.clone())
            .collect();
        tail.reverse();
        tail
    }

    fn round_to_tick(&self, price: f64) -> f64 {
        (price / self.tick_size).round() * self.tick_size
    }

    async fn process_tick(&self, tick: &Tick) {
        let rounded = self.round_to_tick(tick.price);
        let mut bars = self.bars.lock().await;

        for &tf in &self.timeframes {
            let bucket = tf.bucket_secs(tick.timestamp_ns);
            let key = (tick.symbol.clone(), tf, bucket);
            let bar = bars
                .entry(key)
                .or_insert_with(|| FootprintBar::new(tick.symbol.clone(), tf, bucket, tick.price));
            bar.apply_tick(tick, rounded);
            // Best-effort fan-out — we don't care if no one is
            // subscribed; the latest bar is always retrievable via
            // get_bars().
            let _ = self.update_tx.send(bar.clone());
        }
    }
}

async fn run_engine(engine: Arc<FootprintEngine>, mut tick_rx: broadcast::Receiver<Tick>) {
    tracing::info!(
        "FootprintEngine started (timeframes={:?}, tick_size={})",
        engine.timeframes.iter().map(Timeframe::as_str).collect::<Vec<_>>(),
        engine.tick_size,
    );
    loop {
        match tick_rx.recv().await {
            Ok(tick) => engine.process_tick(&tick).await,
            Err(broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!("FootprintEngine lagged, dropped {} ticks", n);
            }
            Err(broadcast::error::RecvError::Closed) => {
                tracing::info!("FootprintEngine: tick channel closed, exiting");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tick(ts_secs: u64, price: f64, qty: f64, side: Side) -> Tick {
        Tick {
            timestamp_ns: ts_secs * 1_000_000_000,
            price,
            qty,
            side,
            symbol: "MNQM6.CME".to_string(),
            source: "test".to_string(),
        }
    }

    #[tokio::test]
    async fn buys_and_sells_split_by_level() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        engine.process_tick(&tick(100, 28379.50, 1.0, Side::Buy)).await;
        engine.process_tick(&tick(101, 28379.75, 2.0, Side::Buy)).await;
        engine.process_tick(&tick(102, 28379.50, 3.0, Side::Sell)).await;

        let bars = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 1).await;
        let bar = bars.first().expect("one bar");
        assert_eq!(bar.trade_count, 3);
        assert!((bar.total_volume - 6.0).abs() < f64::EPSILON);
        assert!((bar.total_delta - 0.0).abs() < f64::EPSILON);
        assert_eq!(bar.levels.len(), 2);
        let level_50 = bar.levels.iter().find(|l| (l.price - 28379.50).abs() < f64::EPSILON).unwrap();
        assert_eq!(level_50.buy_volume, 1.0);
        assert_eq!(level_50.sell_volume, 3.0);
    }

    #[tokio::test]
    async fn rounds_off_tick_prices() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        // 28379.60 should round to 28379.50 with tick=0.25
        engine.process_tick(&tick(100, 28379.60, 1.0, Side::Buy)).await;
        let bars = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 1).await;
        let bar = &bars[0];
        assert_eq!(bar.levels.len(), 1);
        assert!((bar.levels[0].price - 28379.50).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn separate_buckets_per_timeframe() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5, Timeframe::Min1], 0.25);
        // Two ticks 30 seconds apart fall into the same 1-minute
        // bucket but different 5-second buckets.
        engine.process_tick(&tick(60, 28379.50, 1.0, Side::Buy)).await;
        engine.process_tick(&tick(90, 28379.75, 2.0, Side::Sell)).await;

        let sec5 = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 10).await;
        assert_eq!(sec5.len(), 2);
        let min1 = engine.get_bars("MNQM6.CME", Timeframe::Min1, 10).await;
        assert_eq!(min1.len(), 1);
        assert_eq!(min1[0].trade_count, 2);
    }
}
