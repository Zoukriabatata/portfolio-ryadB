//! IPC surface area exposed to the React webview.
//!
//! Phase 7.7.2 ships the Rithmic + footprint commands. Future modules
//! (Binance, dxFeed, …) get their own siblings here.

pub mod brokers;
pub mod rithmic;
pub mod rithmic_events;
