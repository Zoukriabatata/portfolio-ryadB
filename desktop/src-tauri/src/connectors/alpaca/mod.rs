//! Alpaca Markets Data API connector — feeds the GEX module.
//! Two-header auth (APCA-API-KEY-ID + APCA-API-SECRET-KEY).
//! Base URL: https://data.alpaca.markets/
//! Options snapshot feed: indicative (free, 15-min delayed).

pub mod api_key;
pub mod client;
pub mod error;
pub mod gex;
pub mod options;

pub use client::AlpacaClient;
pub use error::{AlpacaError, Result};
pub use gex::{compute_gex, GexSnapshot, GexStrike, IvPoint, IvSide, IvSmile};
pub use options::{fetch_chains, fetch_quote, OptionChain, OptionLeg};
