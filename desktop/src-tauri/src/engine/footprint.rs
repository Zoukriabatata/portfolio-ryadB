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

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;

use crate::connectors::tick::{Side, Tick};

/// Capacity of the broadcast channel that fans out updated bars to
/// downstream consumers (Tauri IPC, cache writer, tests, …).
///
/// 1024 was too small: the cache writer's flush() takes the shared DB
/// Mutex (contended at startup by the 5 per-TF `cache_query` scans) and
/// the periodic snapshot-reconcile re-emits the whole bar set at once.
/// While a receiver is stalled, a 1024-slot ring overflows and tokio
/// broadcast drops the oldest bars (`RecvError::Lagged`). Dropped CLOSED
/// buckets are never re-emitted → permanent holes in the SQLite cache
/// (observed: 5096 bars dropped in a single startup burst). 32768 covers
/// the worst observed stall with ~6× margin.
const UPDATE_CHANNEL_CAPACITY: usize = 32768;

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
    Day1,
    /// Tick-based timeframe: a bar closes every 100 ticks. Buckets
    /// by `tick.seq / 100` instead of by clock — bar-for-bar aligned
    /// with the upstream's own 100-tick chart (NinjaTrader Bridge).
    /// Requires the connector to populate `Tick.seq` monotonically.
    Ticks100,
}

impl Timeframe {
    /// Duration in seconds. Only meaningful for time-based timeframes;
    /// returns 0 for tick-based ones (they have no fixed duration).
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
            Timeframe::Day1 => 86400,
            Timeframe::Ticks100 => 0,
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
            Timeframe::Day1 => "1d",
            Timeframe::Ticks100 => "100t",
        }
    }

    /// True iff this timeframe groups bars by a per-source tick
    /// counter (`Tick.seq`) rather than by clock.
    pub fn is_tick_based(&self) -> bool {
        matches!(self, Timeframe::Ticks100)
    }

    /// Bucket key for a tick under this timeframe.
    ///   - Time TFs: floor-aligned epoch second of the bar.
    ///   - Tick TFs: `seq / N`. The bar's bucket_ts_ns is set
    ///     separately from the FIRST tick's timestamp_ns so the
    ///     X-axis stays time-meaningful.
    pub fn bucket_key(&self, ts_ns: u64, seq: u64) -> u64 {
        match self {
            Timeframe::Ticks100 => seq / 100,
            _ => {
                let ts_secs = ts_ns / 1_000_000_000;
                let dur = self.duration_secs();
                (ts_secs / dur) * dur
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
    fn new(symbol: String, timeframe: Timeframe, bucket_ts_ns: u64, seed_price: f64) -> Self {
        Self {
            symbol,
            timeframe: timeframe.as_str(),
            bucket_ts_ns,
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

/// Mutable engine state guarded by a single Mutex. Grouping the bar
/// map and the per-symbol tick-size table behind one lock means the
/// hot path (`process_tick`) takes exactly ONE lock per tick — the
/// per-symbol tick lookup rides along inside the same critical section
/// instead of adding a second lock (see CLAUDE.md hot-path rule).
struct EngineState {
    bars: BTreeMap<(String, Timeframe, u64), FootprintBar>,
    /// symbol → tick size. Populated at session start (e.g. the bridge
    /// M-header) before any tick for that symbol is processed. Symbols
    /// absent here fall back to `default_tick_size`.
    tick_sizes: HashMap<String, f64>,
}

/// Round `price` to the nearest multiple of `tick`. Free function (no
/// `&self`) so it can be called while the engine state lock is held
/// without a borrow conflict.
#[inline]
fn round_to_tick(price: f64, tick: f64) -> f64 {
    (price / tick).round() * tick
}

/// Engine that turns a tick stream into footprint bars. Cheap to
/// share — `Arc<FootprintEngine>` exposes both the input task spawn
/// and the read-side (`updates()`, `get_bars()`) without any further
/// wrapping.
pub struct FootprintEngine {
    state: Mutex<EngineState>,
    timeframes: Vec<Timeframe>,
    /// Fallback tick size for symbols not registered via
    /// `set_symbol_tick_size`. Preserves legacy single-tick behavior
    /// (MNQ/ES/NQ all 0.25 on Rithmic).
    default_tick_size: f64,
    update_tx: broadcast::Sender<FootprintBar>,
}

impl FootprintEngine {
    pub fn new(timeframes: Vec<Timeframe>, tick_size: f64) -> Self {
        assert!(tick_size > 0.0, "tick_size must be positive");
        let (update_tx, _) = broadcast::channel(UPDATE_CHANNEL_CAPACITY);
        Self {
            state: Mutex::new(EngineState {
                bars: BTreeMap::new(),
                tick_sizes: HashMap::new(),
            }),
            timeframes,
            default_tick_size: tick_size,
            update_tx,
        }
    }

    /// Register the tick size for a symbol. Must be called BEFORE any
    /// tick for that symbol reaches `process_tick` so historical bars
    /// round on the correct grid. The bridge reader calls this from
    /// the M-header branch, before forwarding the first historical
    /// tick — race-free because the reader is the single tick producer
    /// and the engine pump drains the channel in FIFO order.
    pub async fn set_symbol_tick_size(&self, symbol: String, tick_size: f64) {
        if tick_size > 0.0 {
            self.state.lock().await.tick_sizes.insert(symbol, tick_size);
        }
    }

    /// Drop all bars for a symbol across every timeframe. Called when a
    /// fresh bridge backfill begins (M-header) so each session fully
    /// REPLACES the symbol's data instead of layering a new partial
    /// backfill on top of a previous session's bars — that layering is
    /// what produced the mid-chart gap (e.g. 16:40→20:04 kept from an
    /// old session, 22:53→now from the new one, nothing in between).
    pub async fn clear_symbol(&self, symbol: &str) {
        self.state
            .lock()
            .await
            .bars
            .retain(|(s, _, _), _| s != symbol);
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
        let state = self.state.lock().await;
        let mut tail: Vec<FootprintBar> = state
            .bars
            .iter()
            .filter(|((s, t, _), _)| s == symbol && *t == timeframe)
            .rev()
            .take(n)
            .map(|(_, b)| b.clone())
            .collect();
        tail.reverse();
        tail
    }

    async fn process_tick(&self, tick: &Tick) {
        let mut state = self.state.lock().await;
        // Per-symbol tick size, looked up inside the lock we already
        // hold — no extra hot-path lock. Falls back to the engine
        // default for symbols never registered.
        let tick_size = state
            .tick_sizes
            .get(&tick.symbol)
            .copied()
            .unwrap_or(self.default_tick_size);
        let rounded = round_to_tick(tick.price, tick_size);

        // Clone the symbol string once, outside the timeframe loop.
        // Each BTreeMap key still needs an owned String, so we clone
        // `symbol` (not `tick.symbol`) on every iteration — but that
        // is at most N clones of the pre-allocated `symbol` value,
        // versus the previous 2×N clones from `tick.symbol.clone()`
        // inside the loop (one for the key, one for FootprintBar::new).
        let symbol = tick.symbol.clone();

        for &tf in &self.timeframes {
            let bucket = tf.bucket_key(tick.timestamp_ns, tick.seq);
            // bucket_ts_ns is what the UI plots on the X-axis. For
            // time TFs it's the bucket's epoch second; for tick TFs
            // the bucket id is meaningless as a time, so we anchor
            // on the FIRST tick's timestamp in the bar (taken from
            // `tick.timestamp_ns` at insertion below via or_insert_with).
            let key = (symbol.clone(), tf, bucket);
            let bar = state.bars.entry(key).or_insert_with(|| {
                let bucket_ts_ns = if tf.is_tick_based() {
                    tick.timestamp_ns
                } else {
                    bucket * 1_000_000_000
                };
                FootprintBar::new(symbol.clone(), tf, bucket_ts_ns, tick.price)
            });
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
        "FootprintEngine started (timeframes={:?}, default_tick_size={})",
        engine
            .timeframes
            .iter()
            .map(Timeframe::as_str)
            .collect::<Vec<_>>(),
        engine.default_tick_size,
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
            seq: 0,
        }
    }

    #[tokio::test]
    async fn buys_and_sells_split_by_level() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        engine
            .process_tick(&tick(100, 28379.50, 1.0, Side::Buy))
            .await;
        engine
            .process_tick(&tick(101, 28379.75, 2.0, Side::Buy))
            .await;
        engine
            .process_tick(&tick(102, 28379.50, 3.0, Side::Sell))
            .await;

        let bars = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 1).await;
        let bar = bars.first().expect("one bar");
        assert_eq!(bar.trade_count, 3);
        assert!((bar.total_volume - 6.0).abs() < f64::EPSILON);
        assert!((bar.total_delta - 0.0).abs() < f64::EPSILON);
        assert_eq!(bar.levels.len(), 2);
        let level_50 = bar
            .levels
            .iter()
            .find(|l| (l.price - 28379.50).abs() < f64::EPSILON)
            .unwrap();
        assert_eq!(level_50.buy_volume, 1.0);
        assert_eq!(level_50.sell_volume, 3.0);
    }

    #[tokio::test]
    async fn rounds_off_tick_prices() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        // 28379.60 should round to 28379.50 with tick=0.25
        engine
            .process_tick(&tick(100, 28379.60, 1.0, Side::Buy))
            .await;
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
        engine
            .process_tick(&tick(60, 28379.50, 1.0, Side::Buy))
            .await;
        engine
            .process_tick(&tick(90, 28379.75, 2.0, Side::Sell))
            .await;

        let sec5 = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 10).await;
        assert_eq!(sec5.len(), 2);
        let min1 = engine.get_bars("MNQM6.CME", Timeframe::Min1, 10).await;
        assert_eq!(min1.len(), 1);
        assert_eq!(min1[0].trade_count, 2);
    }

    fn tick_sym(ts_secs: u64, price: f64, qty: f64, side: Side, symbol: &str) -> Tick {
        Tick {
            timestamp_ns: ts_secs * 1_000_000_000,
            price,
            qty,
            side,
            symbol: symbol.to_string(),
            source: "test".to_string(),
            seq: 0,
        }
    }

    #[tokio::test]
    async fn per_symbol_tick_size_overrides_default() {
        // Engine default is 0.25 (MNQ/ES/NQ grid). Register GC at 0.1
        // BEFORE feeding its tick — the bridge-reader contract.
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        engine.set_symbol_tick_size("GC 06-26".to_string(), 0.1).await;

        // 2645.13 rounds to 2645.10 on the 0.1 grid (would be 2645.25
        // on the default 0.25 grid — that's the bug we're fixing).
        engine
            .process_tick(&tick_sym(100, 2645.13, 1.0, Side::Buy, "GC 06-26"))
            .await;

        let bars = engine.get_bars("GC 06-26", Timeframe::Sec5, 1).await;
        let bar = bars.first().expect("one GC bar");
        assert_eq!(bar.levels.len(), 1);
        assert!(
            (bar.levels[0].price - 2645.10).abs() < 1e-6,
            "GC tick should snap to the 0.1 grid, got {}",
            bar.levels[0].price
        );

        // A symbol NOT registered still uses the 0.25 default — the
        // shared engine keeps MNQ correct alongside GC.
        engine
            .process_tick(&tick_sym(100, 28379.60, 1.0, Side::Buy, "MNQM6.CME"))
            .await;
        let mnq = engine.get_bars("MNQM6.CME", Timeframe::Sec5, 1).await;
        assert!((mnq[0].levels[0].price - 28379.50).abs() < 1e-6);
    }

    #[tokio::test]
    async fn unregistered_symbol_uses_default_tick_size() {
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        // No set_symbol_tick_size call — must fall back to 0.25.
        engine
            .process_tick(&tick_sym(100, 2645.13, 1.0, Side::Buy, "GC 06-26"))
            .await;
        let bars = engine.get_bars("GC 06-26", Timeframe::Sec5, 1).await;
        assert!((bars[0].levels[0].price - 2645.25).abs() < 1e-6);
    }

    #[tokio::test]
    async fn clear_symbol_drops_only_that_symbol() {
        // Models a bridge backfill replacing a stale prior session: an
        // old session's bars (t=100) must be gone after clear, and a new
        // session (t=300) must NOT be layered under them with a gap.
        let engine = FootprintEngine::new(vec![Timeframe::Sec5], 0.25);
        engine
            .process_tick(&tick_sym(100, 2645.0, 1.0, Side::Buy, "GC 06-26"))
            .await;
        engine
            .process_tick(&tick_sym(100, 28379.50, 1.0, Side::Buy, "MNQM6.CME"))
            .await;

        // Fresh backfill for GC starts → clear GC only.
        engine.clear_symbol("GC 06-26").await;
        assert!(
            engine.get_bars("GC 06-26", Timeframe::Sec5, 10).await.is_empty(),
            "GC bars should be wiped"
        );
        // Other symbols are untouched (shared engine).
        assert_eq!(
            engine.get_bars("MNQM6.CME", Timeframe::Sec5, 10).await.len(),
            1,
            "clearing GC must not touch MNQ"
        );

        // New GC session rebuilds cleanly — only the new bucket exists,
        // no stale t=100 bar lingering to create a mid-chart gap.
        engine
            .process_tick(&tick_sym(300, 2646.0, 2.0, Side::Buy, "GC 06-26"))
            .await;
        let gc = engine.get_bars("GC 06-26", Timeframe::Sec5, 10).await;
        assert_eq!(gc.len(), 1);
        assert_eq!(gc[0].bucket_ts_ns, 300 * 1_000_000_000);
    }

    fn tick_seq(
        seq: u64,
        ts_secs: u64,
        price: f64,
        qty: f64,
        side: Side,
    ) -> Tick {
        Tick {
            timestamp_ns: ts_secs * 1_000_000_000,
            price,
            qty,
            side,
            symbol: "MNQM6.CME".to_string(),
            source: "bridge".to_string(),
            seq,
        }
    }

    #[tokio::test]
    async fn ticks100_buckets_every_100_trades() {
        // Feed 250 ticks with monotonic seq 0..249 — expect exactly
        // 3 bars (seq 0-99, 100-199, 200-249) under Timeframe::Ticks100.
        // Each closed bar must hold exactly 100 trades, regardless of
        // their timestamps.
        let engine = FootprintEngine::new(vec![Timeframe::Ticks100], 0.25);
        for s in 0..250u64 {
            // Timestamps span 30 seconds — would yield ~30 different
            // 1-second buckets on a time TF, but tick TF must collapse
            // them by seq // 100 → 3 bars only.
            engine
                .process_tick(&tick_seq(
                    s,
                    100 + s / 8,    // ts advances slowly relative to seq
                    28000.0 + (s as f64) * 0.25,
                    1.0,
                    Side::Buy,
                ))
                .await;
        }

        let bars = engine
            .get_bars("MNQM6.CME", Timeframe::Ticks100, 10)
            .await;
        assert_eq!(bars.len(), 3, "expected 3 tick bars, got {}", bars.len());
        assert_eq!(bars[0].trade_count, 100, "bar 0 must hold 100 trades");
        assert_eq!(bars[1].trade_count, 100, "bar 1 must hold 100 trades");
        assert_eq!(bars[2].trade_count, 50, "bar 2 (in-progress) holds 50 trades");

        // bucket_ts_ns of bar k must be the timestamp of the FIRST tick
        // of that bar — i.e. seq k*100. With ts = 100 + s/8, that gives
        // seq 0 → ts 100, seq 100 → ts 112, seq 200 → ts 125.
        assert_eq!(bars[0].bucket_ts_ns, 100 * 1_000_000_000);
        assert_eq!(bars[1].bucket_ts_ns, 112 * 1_000_000_000);
        assert_eq!(bars[2].bucket_ts_ns, 125 * 1_000_000_000);
    }

    #[test]
    fn timeframe_is_tick_based_only_for_tick_variants() {
        assert!(Timeframe::Ticks100.is_tick_based());
        assert!(!Timeframe::Min1.is_tick_based());
        assert!(!Timeframe::Sec5.is_tick_based());
        assert!(!Timeframe::Hour1.is_tick_based());
    }
}
