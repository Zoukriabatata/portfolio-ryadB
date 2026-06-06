//! Tauri-managed state for the Rithmic + footprint subsystem.
//!
//! `RithmicState` is registered via `app.manage()` in `lib.rs::run()`
//! and accessed by every `#[tauri::command]` that touches the
//! market-data layer. The struct holds:
//!   - the live `RithmicAdapter` (or `None` while logged out),
//!   - the shared `FootprintEngine` (created once at startup; the
//!     adapter feeds it via spawn()),
//!   - the `JoinHandle` for the engine's tick-pumping task so we can
//!     abort it on logout.
//!
//! Phase B / M2 adds `CryptoState` alongside it for the public
//! Binance/Bybit/Deribit adapters. They share an independent
//! FootprintEngine because their tick size and bar cadence differ
//! from CME futures.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::connectors::binance::BinanceAdapter;
use crate::connectors::bridge::BridgeAdapter;
use crate::connectors::bybit::orderbook::OrderbookSubscriberHandle;
use crate::connectors::bybit::BybitAdapter;
use crate::connectors::deribit::DeribitAdapter;
use crate::connectors::rithmic::RithmicAdapter;
use crate::engine::{FootprintEngine, Timeframe};

/// MNQ tick size. Phase 8 will replace this with a per-symbol lookup
/// via Rithmic's RequestReferenceData; for now MNQ/ES/NQ all share
/// 0.25 so it's a fine default while we ship the prototype.
const DEFAULT_TICK_SIZE: f64 = 0.25;

/// Crypto default tick — BTCUSDT spot is ~0.01, but most footprint
/// rendering at the M2 stage works fine with 0.10 to avoid ultra-thin
/// columns. M3 will replace this with a per-symbol lookup once the
/// crypto UI lands.
const DEFAULT_CRYPTO_TICK_SIZE: f64 = 0.10;

pub struct RithmicState {
    pub adapter: Mutex<Option<RithmicAdapter>>,
    pub engine: Arc<FootprintEngine>,
    pub engine_handle: Mutex<Option<JoinHandle<()>>>,
}

impl RithmicState {
    pub fn new() -> Self {
        let engine = Arc::new(FootprintEngine::new(
            vec![
                Timeframe::Sec5,
                Timeframe::Sec15,
                Timeframe::Sec30,
                Timeframe::Min1,
                Timeframe::Min3,
                Timeframe::Min5,
                Timeframe::Min15,
                Timeframe::Hour1,
                // Tick-based — only relevant for the bridge connector
                // which populates `Tick.seq`. Rithmic ticks come in
                // with seq=0 so every Rithmic tick would land in the
                // SAME 100T bucket forever — UI must filter this TF
                // out for the Rithmic session. Cheap to keep here so
                // the bridge session (which shares this engine) can
                // aggregate 100T bars without a second engine.
                Timeframe::Ticks100,
            ],
            DEFAULT_TICK_SIZE,
        ));

        Self {
            adapter: Mutex::new(None),
            engine,
            engine_handle: Mutex::new(None),
        }
    }
}

impl Default for RithmicState {
    fn default() -> Self {
        Self::new()
    }
}

/// Holds the three crypto adapters and the shared crypto-side
/// FootprintEngine. Each adapter has its own engine pump task — the
/// engine itself doesn't care which exchange a tick came from since
/// `Tick.source` already disambiguates.
pub struct CryptoState {
    pub binance: Mutex<Option<BinanceAdapter>>,
    pub bybit: Mutex<Option<BybitAdapter>>,
    pub deribit: Mutex<Option<DeribitAdapter>>,
    pub engine: Arc<FootprintEngine>,
    pub binance_pump: Mutex<Option<JoinHandle<()>>>,
    pub bybit_pump: Mutex<Option<JoinHandle<()>>>,
    pub deribit_pump: Mutex<Option<JoinHandle<()>>>,
    /// M6b-1 — `crypto-tick-batch` event emitter task (coalesced 16 ms).
    /// Symmetric to the engine pump but batched and routed to a
    /// Tauri event for the heatmap trade-bubbles overlay. Per-
    /// adapter Mutex<Option<JoinHandle>> so the cleanup path
    /// matches the existing pump pattern.
    pub bybit_tick_emit: Mutex<Option<JoinHandle<()>>>,
    /// M3.5 — independent Bybit orderbook subscribers, keyed by
    /// upper-case symbol. Each entry owns a tokio task + a oneshot
    /// shutdown sender; dropping the sender (via remove + send)
    /// stops the task gracefully.
    pub bybit_orderbooks: Mutex<HashMap<String, OrderbookSubscriberHandle>>,
}

impl CryptoState {
    pub fn new() -> Self {
        let engine = Arc::new(FootprintEngine::new(
            vec![
                Timeframe::Sec5,
                Timeframe::Sec15,
                Timeframe::Sec30,
                Timeframe::Min1,
                Timeframe::Min3,
                Timeframe::Min5,
                Timeframe::Min15,
                Timeframe::Hour1,
            ],
            DEFAULT_CRYPTO_TICK_SIZE,
        ));
        Self {
            binance: Mutex::new(None),
            bybit: Mutex::new(None),
            deribit: Mutex::new(None),
            engine,
            binance_pump: Mutex::new(None),
            bybit_pump: Mutex::new(None),
            deribit_pump: Mutex::new(None),
            bybit_tick_emit: Mutex::new(None),
            bybit_orderbooks: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for CryptoState {
    fn default() -> Self {
        Self::new()
    }
}

/// NinjaTrader bridge state.
///
/// Reuses the Rithmic-side `FootprintEngine` because the bridge streams
/// CME futures with the same tick size (0.25 on MNQ) and the same set
/// of timeframes. The frontend already listens to `footprint-update`
/// from this engine, so swapping sources is transparent.
///
/// At any given time, the user runs EITHER the native Rithmic adapter
/// OR the bridge — `bridge_connect` does not refuse if Rithmic is
/// connected (and vice versa), but the UI surface only exposes one at
/// a time via the source switcher.
pub struct BridgeState {
    pub adapter: Mutex<Option<BridgeAdapter>>,
    pub engine: Arc<FootprintEngine>,
    pub engine_pump: Mutex<Option<JoinHandle<()>>>,
    pub state_emit: Mutex<Option<JoinHandle<()>>>,
    /// Per-session pump for L2 depth updates. Lives only while the
    /// adapter is connected — aborted on disconnect alongside
    /// engine_pump + state_emit.
    pub depth_pump: Mutex<Option<JoinHandle<()>>>,
}

impl BridgeState {
    pub fn new(engine: Arc<FootprintEngine>) -> Self {
        Self {
            adapter: Mutex::new(None),
            engine,
            engine_pump: Mutex::new(None),
            state_emit: Mutex::new(None),
            depth_pump: Mutex::new(None),
        }
    }
}
