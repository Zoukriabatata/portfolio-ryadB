use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tick {
    pub timestamp_ns: u64,
    pub price: f64,
    pub qty: f64,
    pub side: Side,
    pub symbol: String,
    pub source: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    /// Aggressor lifted the offer.
    Buy,
    /// Aggressor hit the bid.
    Sell,
}
