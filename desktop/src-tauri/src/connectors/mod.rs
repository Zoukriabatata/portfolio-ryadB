//! Market data connectors.
//!
//! Each connector adapts an external feed (Rithmic, Binance, dxFeed, …)
//! to the common `MarketDataAdapter` trait, emitting normalized `Tick`s
//! over a broadcast channel that the rest of the app subscribes to.
//!
//! Phase 7.0 ships scaffolding only; nothing in this module is wired
//! into IPC commands yet, so dead_code warnings on the public surface
//! are expected until Phase 7.3+ start invoking it.
#![allow(dead_code)]

pub mod adapter;
pub mod binance;
pub mod bybit;
pub mod deribit;
pub mod error;
pub mod rithmic;
pub mod tick;

pub use adapter::{Credentials, MarketDataAdapter};
pub use error::{ConnectorError, Result};
pub use tick::{Side, Tick};
