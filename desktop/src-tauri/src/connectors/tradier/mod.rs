//! Tradier Sandbox REST connector — feeds the GEX module.
//! Bearer-auth on every request; keyring-backed API key.
//! Sandbox URL: https://sandbox.tradier.com/v1/
//! Quota: 60 req/min, 15-min delayed quotes (acceptable for GEX).

pub mod error;

pub use error::{Result, TradierError};
