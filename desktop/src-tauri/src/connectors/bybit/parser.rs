//! Bybit V5 publicTrade JSON → normalized `Tick`.
//!
//! Unlike Binance, the `S` field is the aggressor side directly
//! ("Buy" or "Sell"), so no inversion is needed. A single message can
//! carry multiple trades in `data[]` — `parse_message` flattens them.

use serde::Deserialize;

use crate::connectors::tick::{Side, Tick};

const SOURCE_NAME: &str = "bybit";

#[derive(Debug, Deserialize)]
pub struct BybitTradeData {
    #[serde(rename = "T")]
    pub trade_time_ms: u64,
    #[serde(rename = "s")]
    pub symbol: String,
    #[serde(rename = "S")]
    pub side: String,
    #[serde(rename = "v")]
    pub volume: String,
    #[serde(rename = "p")]
    pub price: String,
    #[serde(rename = "i")]
    pub trade_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BybitTradeMessage {
    pub topic: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub ts: u64,
    pub data: Vec<BybitTradeData>,
}

pub fn trade_to_tick(d: &BybitTradeData) -> Option<Tick> {
    let price = d.price.parse::<f64>().ok()?;
    let qty = d.volume.parse::<f64>().ok()?;
    let side = match d.side.as_str() {
        "Buy" => Side::Buy,
        "Sell" => Side::Sell,
        _ => return None,
    };
    Some(Tick {
        timestamp_ns: d.trade_time_ms.saturating_mul(1_000_000),
        price,
        qty,
        side,
        symbol: d.symbol.clone(),
        source: SOURCE_NAME.to_string(),
    })
}

pub fn parse_message(msg: &BybitTradeMessage) -> Vec<Tick> {
    if !msg.topic.starts_with("publicTrade.") {
        return Vec::new();
    }
    msg.data.iter().filter_map(trade_to_tick).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_buy_side_directly() {
        let json = r#"{"topic":"publicTrade.BTCUSDT","type":"snapshot","ts":1672304486868,"data":[{"T":1672304486865,"s":"BTCUSDT","S":"Buy","v":"0.001","p":"16578.50","L":"PlusTick","i":"id-1","BT":false}]}"#;
        let msg: BybitTradeMessage = serde_json::from_str(json).unwrap();
        let ticks = parse_message(&msg);
        assert_eq!(ticks.len(), 1);
        assert_eq!(ticks[0].side, Side::Buy);
        assert_eq!(ticks[0].price, 16578.50);
    }

    #[test]
    fn skips_unknown_side() {
        let d = BybitTradeData {
            trade_time_ms: 1,
            symbol: "X".into(),
            side: "Unknown".into(),
            volume: "1".into(),
            price: "1".into(),
            trade_id: "id".into(),
        };
        assert!(trade_to_tick(&d).is_none());
    }
}
