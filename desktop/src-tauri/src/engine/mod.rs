//! In-process market data analytics.
//!
//! Phase 7.7.1 ships the footprint aggregator: it consumes the
//! normalized `Tick` stream coming out of `connectors/` and groups
//! prints into per-bar / per-price-level / per-side buckets.

pub mod footprint;

pub use footprint::{FootprintBar, FootprintEngine, PriceLevel, Timeframe};
