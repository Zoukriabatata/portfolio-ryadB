//! In-process market data analytics.
//!
//! Phase 7.7.1 ships the footprint aggregator: it consumes the
//! normalized `Tick` stream coming out of `connectors/` and groups
//! prints into per-bar / per-price-level / per-side buckets.
//! Phase B / M3.5 adds the orderbook state machine alongside it,
//! consumed by the heatmap pipeline.

pub mod footprint;
pub mod orderbook;

pub use footprint::{FootprintBar, FootprintEngine, PriceLevel, Timeframe};
pub use orderbook::{OrderbookEngine, OrderbookLevel, OrderbookUpdate};
