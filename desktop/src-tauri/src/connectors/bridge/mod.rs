//! NinjaTrader bridge connector.
//!
//! Reads tick-by-tick history + live trades from a NinjaScript
//! indicator (`desktop/scripts/ninjatrader/OrderflowBridge.cs`)
//! over TCP loopback. The wire protocol is documented in `parser.rs`.
//!
//! This is a public-data adapter from our perspective — there is no
//! authentication on the loopback socket. NinjaTrader handles the
//! upstream broker session (typically Rithmic / Apex). The bridge is
//! the workaround for HISTORY_PLANT permissions being unavailable on
//! Apex Trader Funding accounts: NinjaTrader has the historical
//! ticks; we just receive them.
//!
//! ## Invariants the upstream must respect
//!
//! For tick-based timeframes (e.g. 100T) to align bar-for-bar with
//! NinjaTrader's own chart, the running `OrderflowBridge.cs` must
//! be v2 or later (it then emits a monotonic per-session `seq` on
//! every tick) AND the NT chart must have Tick Replay ON. The reader
//! detects the all-zero-seq case and emits `BridgeConnState::Misconfigured`
//! so the UI can prompt the user to fix it. Time-based timeframes
//! work regardless.

pub mod adapter;
pub mod client;
pub mod parser;
pub mod reader;

pub use adapter::BridgeAdapter;
pub use client::BridgeConfig;
pub use parser::{parse_line, BridgeMessage, BridgeMeta, ParseError};
pub use reader::{BridgeConnState, BRIDGE_SOURCE};
