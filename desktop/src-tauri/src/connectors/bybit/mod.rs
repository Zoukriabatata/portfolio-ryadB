//! Bybit V5 (linear USDT-perp) public market-data connector.
//!
//! Uses `wss://stream.bybit.com/v5/public/linear` and subscribes to
//! `publicTrade.{SYMBOL}` topics. Bybit requires explicit application
//! pings (`{"op":"ping"}`) every ~20s — the heartbeat task in this
//! module handles that.
#![allow(dead_code)]

pub mod adapter;
pub mod client;
pub mod heartbeat;
pub mod orderbook;
pub mod parser;
pub mod reader;

pub use adapter::{BybitAdapter, DEFAULT_LINEAR_URL, DEFAULT_SPOT_URL};
