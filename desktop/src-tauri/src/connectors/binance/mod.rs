//! Binance Futures (USDT-M) public market-data connector.
//!
//! Streams `aggTrade` events for the requested symbols and converts
//! them to normalized `Tick`s. No authentication — Binance's public
//! WebSocket feed at `wss://fstream.binance.com/ws` is open to
//! anyone, so the connector implements the no-op `login()` default
//! from `MarketDataAdapter`.
#![allow(dead_code)]

pub mod adapter;
pub mod client;
pub mod parser;
pub mod reader;

pub use adapter::{BinanceAdapter, DEFAULT_FUTURES_URL, DEFAULT_SPOT_URL};
