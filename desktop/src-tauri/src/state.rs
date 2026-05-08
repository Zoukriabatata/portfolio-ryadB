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

use std::sync::Arc;

use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::connectors::rithmic::RithmicAdapter;
use crate::engine::{FootprintEngine, Timeframe};

/// MNQ tick size. Phase 8 will replace this with a per-symbol lookup
/// via Rithmic's RequestReferenceData; for now MNQ/ES/NQ all share
/// 0.25 so it's a fine default while we ship the prototype.
const DEFAULT_TICK_SIZE: f64 = 0.25;

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
                Timeframe::Min1,
                Timeframe::Min5,
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
