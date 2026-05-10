//! Deribit V2 public market-data connector.
//!
//! Uses `wss://www.deribit.com/ws/api/v2`. Trade subscriptions go
//! through the JSON-RPC `public/subscribe` method on
//! `trades.{instrument}.raw` channels (e.g. `trades.BTC-PERPETUAL.raw`).
//! Idle timeout is ~60s, so we send `public/test` JSON-RPC pings
//! every 30s as a heartbeat.
#![allow(dead_code)]

pub mod adapter;
pub mod client;
pub mod heartbeat;
pub mod parser;
pub mod reader;

pub use adapter::{DeribitAdapter, DEFAULT_PROD_URL, DEFAULT_TEST_URL};
