//! Binance aggTrade JSON → normalized `Tick`.
//!
//! `m` (is buyer maker) drives aggressor side: when the buyer is the
//! maker, the aggressor sold into the bid (Side::Sell). When the
//! buyer is the taker, the aggressor lifted the offer (Side::Buy).
//! See lib/websocket/BinanceWS.ts for the same convention on the web
//! side.

use serde::Deserialize;

use crate::connectors::tick::{Side, Tick};

const SOURCE_NAME: &str = "binance";

#[derive(Debug, Deserialize)]
pub struct BinanceAggTrade {
    #[serde(rename = "e")]
    pub event: String,
    #[serde(rename = "E")]
    pub event_time_ms: u64,
    #[serde(rename = "s")]
    pub symbol: String,
    #[serde(rename = "a")]
    pub agg_id: u64,
    #[serde(rename = "p")]
    pub price: String,
    #[serde(rename = "q")]
    pub qty: String,
    #[serde(rename = "T")]
    pub trade_time_ms: u64,
    #[serde(rename = "m")]
    pub is_buyer_maker: bool,
}

pub fn agg_trade_to_tick(msg: &BinanceAggTrade) -> Option<Tick> {
    if msg.event != "aggTrade" {
        return None;
    }
    let price = msg.price.parse::<f64>().ok()?;
    let qty = msg.qty.parse::<f64>().ok()?;
    let side = if msg.is_buyer_maker {
        Side::Sell
    } else {
        Side::Buy
    };
    Some(Tick {
        timestamp_ns: msg.trade_time_ms.saturating_mul(1_000_000),
        price,
        qty,
        side,
        // Suffix the source so the FootprintEngine doesn't merge
        // BTCUSDT bars from Binance with BTCUSDT bars from Bybit
        // when both adapters share the engine.
        symbol: format!("{}.BINANCE", msg.symbol),
        source: SOURCE_NAME.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_buyer_maker_as_sell() {
        let json = r#"{"e":"aggTrade","E":1633970000000,"s":"BTCUSDT","a":1,"p":"60000.5","q":"0.5","f":1,"l":1,"T":1633970000000,"m":true}"#;
        let msg: BinanceAggTrade = serde_json::from_str(json).unwrap();
        let tick = agg_trade_to_tick(&msg).unwrap();
        assert_eq!(tick.side, Side::Sell);
        assert_eq!(tick.price, 60000.5);
        assert_eq!(tick.qty, 0.5);
        assert_eq!(tick.symbol, "BTCUSDT.BINANCE");
    }

    #[test]
    fn parses_taker_buy_as_buy() {
        let json = r#"{"e":"aggTrade","E":1633970000000,"s":"ETHUSDT","a":2,"p":"3000","q":"1.0","f":1,"l":1,"T":1633970000000,"m":false}"#;
        let msg: BinanceAggTrade = serde_json::from_str(json).unwrap();
        let tick = agg_trade_to_tick(&msg).unwrap();
        assert_eq!(tick.side, Side::Buy);
    }

    #[test]
    fn rejects_non_aggtrade_events() {
        let json = r#"{"e":"trade","E":1,"s":"X","a":1,"p":"1","q":"1","f":1,"l":1,"T":1,"m":false}"#;
        let msg: BinanceAggTrade = serde_json::from_str(json).unwrap();
        assert!(agg_trade_to_tick(&msg).is_none());
    }
}
