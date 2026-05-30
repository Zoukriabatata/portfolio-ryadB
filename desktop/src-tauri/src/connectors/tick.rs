use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tick {
    pub timestamp_ns: u64,
    pub price: f64,
    pub qty: f64,
    pub side: Side,
    pub symbol: String,
    pub source: String,
    /// Per-source monotonic tick counter, used to bucket tick-based
    /// timeframes (e.g. 100T) bar-for-bar with the upstream's own
    /// tick chart. Only the bridge connector currently emits a real
    /// value here (incremented in `OrderflowBridge.cs`); other
    /// connectors leave it at 0, which is fine because tick-based
    /// timeframes are not selectable for those sources.
    #[serde(default)]
    pub seq: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    /// Aggressor lifted the offer.
    Buy,
    /// Aggressor hit the bid.
    Sell,
}
