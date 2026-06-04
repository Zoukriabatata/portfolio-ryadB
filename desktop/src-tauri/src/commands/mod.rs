//! IPC surface area exposed to the React webview.
//!
//! Phase 7.7.2 ships the Rithmic + footprint commands. Future modules
//! (Binance, dxFeed, …) get their own siblings here.

pub mod account;
pub mod ai_agent;
pub mod bridge;
pub mod bridge_depth;
pub mod bridge_events;
pub mod brokers;
pub mod cache;
pub mod gex;
pub mod option_flow;
pub mod crypto;
pub mod crypto_events;
pub mod crypto_tick_events;
pub mod news;
pub mod rithmic;
pub mod rithmic_events;
