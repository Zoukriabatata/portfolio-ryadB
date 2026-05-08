//! Deribit `trades.*.raw` JSON → normalized `Tick`.
//!
//! Deribit publishes trade events through JSON-RPC `subscription`
//! notifications. The `direction` field is a lowercase string
//! ("buy"|"sell") representing the aggressor side directly.

use serde::Deserialize;

use crate::connectors::tick::{Side, Tick};

const SOURCE_NAME: &str = "deribit";

#[derive(Debug, Deserialize)]
pub struct DeribitTrade {
    pub trade_id: String,
    pub timestamp: u64, // ms since epoch
    pub price: f64,
    pub instrument_name: String,
    pub direction: String,
    pub amount: f64,
}

#[derive(Debug, Deserialize)]
pub struct DeribitSubscriptionParams {
    pub channel: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct DeribitNotification {
    pub jsonrpc: String,
    pub method: Option<String>,
    pub params: Option<DeribitSubscriptionParams>,
}

pub fn trade_to_tick(t: &DeribitTrade) -> Option<Tick> {
    let side = match t.direction.as_str() {
        "buy" => Side::Buy,
        "sell" => Side::Sell,
        _ => return None,
    };
    Some(Tick {
        timestamp_ns: t.timestamp.saturating_mul(1_000_000),
        price: t.price,
        qty: t.amount,
        side,
        symbol: format!("{}.DERIBIT", t.instrument_name),
        source: SOURCE_NAME.to_string(),
    })
}

/// Try to extract trade ticks from a Deribit JSON-RPC frame.
/// Returns an empty Vec for anything that isn't a `trades.*.raw`
/// subscription update — including subscription confirmations,
/// heartbeat replies, and ticker channels.
pub fn parse_message(text: &str) -> Vec<Tick> {
    let notif: DeribitNotification = match serde_json::from_str(text) {
        Ok(n) => n,
        Err(_) => return Vec::new(),
    };
    if notif.method.as_deref() != Some("subscription") {
        return Vec::new();
    }
    let params = match notif.params {
        Some(p) => p,
        None => return Vec::new(),
    };
    if !params.channel.starts_with("trades.") {
        return Vec::new();
    }
    // Trade channels carry an array of trades.
    let trades: Vec<DeribitTrade> = match serde_json::from_value(params.data) {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };
    trades.iter().filter_map(trade_to_tick).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_trade_subscription() {
        let json = r#"{
            "jsonrpc":"2.0",
            "method":"subscription",
            "params":{
                "channel":"trades.BTC-PERPETUAL.raw",
                "data":[{
                    "trade_seq":30289432,
                    "trade_id":"48079269",
                    "timestamp":1590484512188,
                    "tick_direction":2,
                    "price":8950.0,
                    "mark_price":8948.9,
                    "instrument_name":"BTC-PERPETUAL",
                    "index_price":8941.4,
                    "direction":"sell",
                    "amount":10.0
                }]
            }
        }"#;
        let ticks = parse_message(json);
        assert_eq!(ticks.len(), 1);
        assert_eq!(ticks[0].side, Side::Sell);
        assert_eq!(ticks[0].price, 8950.0);
        assert_eq!(ticks[0].symbol, "BTC-PERPETUAL.DERIBIT");
    }

    #[test]
    fn ignores_ticker_channels() {
        let json = r#"{"jsonrpc":"2.0","method":"subscription","params":{"channel":"ticker.BTC-PERPETUAL.raw","data":{}}}"#;
        assert!(parse_message(json).is_empty());
    }

    #[test]
    fn ignores_subscription_acks() {
        let json = r#"{"jsonrpc":"2.0","id":1,"result":["trades.BTC-PERPETUAL.raw"]}"#;
        assert!(parse_message(json).is_empty());
    }
}
