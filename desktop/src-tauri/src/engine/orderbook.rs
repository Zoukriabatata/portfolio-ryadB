//! Phase B / M3.5 — order-book state machine + Tauri event payload.
//!
//! Maintains a per-symbol bid/ask BTreeMap that snapshots and deltas
//! mutate. Sequence is monotonically increasing per Bybit; a
//! rewind triggers a resync (caller resets and re-subscribes).
//!
//! Quantity 0 in a delta level is the canonical "remove this price"
//! signal (Bybit + Binance both use this convention).

use std::collections::BTreeMap;

use ordered_float::OrderedFloat;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderbookLevel {
    pub price: f64,
    pub quantity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderbookUpdate {
    /// Exchange-suffixed symbol, e.g. "BTCUSDT.BYBIT" — same
    /// convention the trade Tick uses.
    pub symbol: String,
    pub timestamp_ns: u64,
    /// Bids sorted descending (best bid first).
    pub bids: Vec<OrderbookLevel>,
    /// Asks sorted ascending (best ask first).
    pub asks: Vec<OrderbookLevel>,
    pub sequence: u64,
    pub depth: u32,
}

pub struct OrderbookEngine {
    symbol: String,
    bids: BTreeMap<OrderedFloat<f64>, f64>,
    asks: BTreeMap<OrderedFloat<f64>, f64>,
    last_sequence: Option<u64>,
    snapshot_received: bool,
    depth: u32,
}

impl OrderbookEngine {
    pub fn new(symbol: String, depth: u32) -> Self {
        Self {
            symbol,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            last_sequence: None,
            snapshot_received: false,
            depth,
        }
    }

    pub fn snapshot_received(&self) -> bool {
        self.snapshot_received
    }

    pub fn last_sequence(&self) -> Option<u64> {
        self.last_sequence
    }

    pub fn apply_snapshot(
        &mut self,
        bids: Vec<(f64, f64)>,
        asks: Vec<(f64, f64)>,
        sequence: u64,
    ) {
        self.bids.clear();
        self.asks.clear();
        for (p, q) in bids {
            self.bids.insert(OrderedFloat(p), q);
        }
        for (p, q) in asks {
            self.asks.insert(OrderedFloat(p), q);
        }
        self.last_sequence = Some(sequence);
        self.snapshot_received = true;
    }

    /// Apply a delta. Returns `Err(...)` when the caller should
    /// reset the engine and re-subscribe (sequence rewind, missing
    /// snapshot). A `seq == last_seq` is tolerated because Bybit
    /// occasionally re-emits the last delta.
    pub fn apply_delta(
        &mut self,
        bids: Vec<(f64, f64)>,
        asks: Vec<(f64, f64)>,
        sequence: u64,
    ) -> Result<(), String> {
        if !self.snapshot_received {
            return Err("delta received before snapshot".into());
        }
        if let Some(last) = self.last_sequence {
            if sequence < last {
                return Err(format!(
                    "sequence rewind: last={} got={}",
                    last, sequence
                ));
            }
        }
        for (p, q) in bids {
            if q == 0.0 {
                self.bids.remove(&OrderedFloat(p));
            } else {
                self.bids.insert(OrderedFloat(p), q);
            }
        }
        for (p, q) in asks {
            if q == 0.0 {
                self.asks.remove(&OrderedFloat(p));
            } else {
                self.asks.insert(OrderedFloat(p), q);
            }
        }
        self.last_sequence = Some(sequence);
        Ok(())
    }

    pub fn reset(&mut self) {
        self.bids.clear();
        self.asks.clear();
        self.last_sequence = None;
        self.snapshot_received = false;
    }

    /// Build an emit-ready snapshot payload, capped to `depth`
    /// levels per side. `exchange_suffix` is the upper-case venue
    /// tag appended to the symbol ("BYBIT", "BINANCE", …).
    pub fn snapshot_event(&self, exchange_suffix: &str) -> OrderbookUpdate {
        let timestamp_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);

        // BTreeMap iter is ascending; bids need the top of book
        // first (descending), so we reverse there.
        let bids: Vec<OrderbookLevel> = self
            .bids
            .iter()
            .rev()
            .take(self.depth as usize)
            .map(|(p, q)| OrderbookLevel {
                price: p.into_inner(),
                quantity: *q,
            })
            .collect();
        let asks: Vec<OrderbookLevel> = self
            .asks
            .iter()
            .take(self.depth as usize)
            .map(|(p, q)| OrderbookLevel {
                price: p.into_inner(),
                quantity: *q,
            })
            .collect();

        OrderbookUpdate {
            symbol: format!("{}.{}", self.symbol, exchange_suffix),
            timestamp_ns,
            bids,
            asks,
            sequence: self.last_sequence.unwrap_or(0),
            depth: self.depth,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_then_delta_remove() {
        let mut e = OrderbookEngine::new("BTCUSDT".into(), 50);
        e.apply_snapshot(
            vec![(80000.0, 1.0), (79999.0, 2.0)],
            vec![(80001.0, 0.5), (80002.0, 1.5)],
            1,
        );
        // Remove 80000 via quantity=0.
        e.apply_delta(vec![(80000.0, 0.0)], vec![], 2).unwrap();
        let ev = e.snapshot_event("BYBIT");
        assert_eq!(ev.bids.len(), 1);
        assert_eq!(ev.bids[0].price, 79999.0);
        assert_eq!(ev.symbol, "BTCUSDT.BYBIT");
    }

    #[test]
    fn delta_before_snapshot_errors() {
        let mut e = OrderbookEngine::new("BTCUSDT".into(), 50);
        let r = e.apply_delta(vec![(80000.0, 1.0)], vec![], 1);
        assert!(r.is_err());
    }

    #[test]
    fn sequence_rewind_errors() {
        let mut e = OrderbookEngine::new("BTCUSDT".into(), 50);
        e.apply_snapshot(vec![], vec![], 10);
        let r = e.apply_delta(vec![], vec![], 9);
        assert!(r.is_err());
    }

    #[test]
    fn bids_sorted_desc_asks_asc() {
        let mut e = OrderbookEngine::new("BTCUSDT".into(), 50);
        e.apply_snapshot(
            vec![(79999.0, 2.0), (80000.0, 1.0), (79998.0, 3.0)],
            vec![(80002.0, 1.5), (80001.0, 0.5)],
            1,
        );
        let ev = e.snapshot_event("BYBIT");
        assert_eq!(ev.bids[0].price, 80000.0);
        assert_eq!(ev.bids[1].price, 79999.0);
        assert_eq!(ev.bids[2].price, 79998.0);
        assert_eq!(ev.asks[0].price, 80001.0);
        assert_eq!(ev.asks[1].price, 80002.0);
    }
}
