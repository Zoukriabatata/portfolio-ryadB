//! Databento market data connector.
//! OPRA real-time option chain (for GEX) + option trades (for flow).

pub mod api_key;
pub mod black_scholes;
pub mod options;

pub use options::{fetch_option_chain, fetch_recent_trades, fetch_spot};
