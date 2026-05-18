//! Tradier `/markets/options/*` and `/markets/quotes` parsers.
//! All functions take a `TradierClient` and return decoded public types.

use serde::Deserialize;

use crate::connectors::tradier::client::TradierClient;
use crate::connectors::tradier::error::{Result, TradierError};

/// One option leg (call OR put) as exposed to the compute layer.
#[derive(Debug, Clone)]
pub struct OptionLeg {
    pub strike: f64,
    pub open_interest: u64,
    pub gamma: Option<f64>,
    pub iv: Option<f64>, // implied vol fraction (e.g. 0.18 = 18%)
}

/// One full expiration chain split into calls + puts.
#[derive(Debug, Clone, Default)]
pub struct OptionChain {
    pub expiration: String,
    pub calls: Vec<OptionLeg>,
    pub puts: Vec<OptionLeg>,
}

// ─── Raw Tradier JSON shapes (internal) ─────────────────────────────

#[derive(Debug, Deserialize)]
struct ExpirationsEnvelope {
    expirations: Option<ExpirationsBody>,
}
#[derive(Debug, Deserialize)]
struct ExpirationsBody {
    #[serde(default)]
    date: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ChainsEnvelope {
    options: Option<ChainsBody>,
}
#[derive(Debug, Deserialize)]
struct ChainsBody {
    #[serde(default)]
    option: Vec<RawOption>,
}
#[derive(Debug, Deserialize)]
struct RawOption {
    #[serde(default)]
    strike: f64,
    #[serde(default)]
    option_type: String, // "call" | "put"
    #[serde(default)]
    open_interest: u64,
    greeks: Option<RawGreeks>,
}
#[derive(Debug, Deserialize)]
struct RawGreeks {
    gamma: Option<f64>,
    smv_vol: Option<f64>,
    mid_iv: Option<f64>,
    bid_iv: Option<f64>,
    ask_iv: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct QuoteEnvelope {
    quotes: Option<QuoteBody>,
}
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum QuoteBody {
    Single { quote: SingleQuote },
    None,
}
#[derive(Debug, Deserialize)]
struct SingleQuote {
    #[serde(default)]
    last: Option<f64>,
    #[serde(default)]
    prevclose: Option<f64>,
}

/// Pick best-available IV from the greeks block (smv_vol > mid_iv > avg(bid,ask)).
fn pick_iv(g: &RawGreeks) -> Option<f64> {
    g.smv_vol
        .or(g.mid_iv)
        .or_else(|| match (g.bid_iv, g.ask_iv) {
            (Some(b), Some(a)) => Some((b + a) / 2.0),
            (Some(b), None) => Some(b),
            (None, Some(a)) => Some(a),
            (None, None) => None,
        })
}

pub async fn fetch_expirations(client: &TradierClient, symbol: &str) -> Result<Vec<String>> {
    let env: ExpirationsEnvelope = client
        .get_json(
            "markets/options/expirations",
            &[("symbol", symbol), ("includeAllRoots", "true")],
        )
        .await?;
    Ok(env.expirations.map(|b| b.date).unwrap_or_default())
}

pub async fn fetch_chain(
    client: &TradierClient,
    symbol: &str,
    expiration: &str,
) -> Result<OptionChain> {
    let env: ChainsEnvelope = client
        .get_json(
            "markets/options/chains",
            &[
                ("symbol", symbol),
                ("expiration", expiration),
                ("greeks", "true"),
            ],
        )
        .await?;
    let raw = env.options.map(|b| b.option).unwrap_or_default();
    let mut calls: Vec<OptionLeg> = Vec::new();
    let mut puts: Vec<OptionLeg> = Vec::new();
    for o in raw {
        let leg = OptionLeg {
            strike: o.strike,
            open_interest: o.open_interest,
            gamma: o.greeks.as_ref().and_then(|g| g.gamma),
            iv: o.greeks.as_ref().and_then(pick_iv),
        };
        match o.option_type.as_str() {
            "call" => calls.push(leg),
            "put" => puts.push(leg),
            _ => {}
        }
    }
    Ok(OptionChain {
        expiration: expiration.to_string(),
        calls,
        puts,
    })
}

pub async fn fetch_quote(client: &TradierClient, symbol: &str) -> Result<f64> {
    let env: QuoteEnvelope = client
        .get_json("markets/quotes", &[("symbols", symbol)])
        .await?;
    let q = match env.quotes {
        Some(QuoteBody::Single { quote }) => quote,
        _ => return Err(TradierError::Decode("missing quote body".into())),
    };
    q.last
        .or(q.prevclose)
        .ok_or_else(|| TradierError::Decode("quote missing last+prevclose".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_iv_prefers_smv_then_mid_then_avg() {
        let g = RawGreeks {
            gamma: None,
            smv_vol: Some(0.18),
            mid_iv: Some(0.20),
            bid_iv: Some(0.19),
            ask_iv: Some(0.21),
        };
        assert_eq!(pick_iv(&g), Some(0.18));

        let g = RawGreeks {
            gamma: None,
            smv_vol: None,
            mid_iv: Some(0.20),
            bid_iv: None,
            ask_iv: None,
        };
        assert_eq!(pick_iv(&g), Some(0.20));

        let g = RawGreeks {
            gamma: None,
            smv_vol: None,
            mid_iv: None,
            bid_iv: Some(0.19),
            ask_iv: Some(0.21),
        };
        assert_eq!(pick_iv(&g), Some(0.20));

        let g = RawGreeks {
            gamma: None,
            smv_vol: None,
            mid_iv: None,
            bid_iv: None,
            ask_iv: None,
        };
        assert_eq!(pick_iv(&g), None);
    }

    #[test]
    fn parses_expirations_envelope() {
        let json = r#"{"expirations":{"date":["2026-05-30","2026-06-06"]}}"#;
        let env: ExpirationsEnvelope = serde_json::from_str(json).unwrap();
        assert_eq!(env.expirations.unwrap().date.len(), 2);
    }

    #[test]
    fn parses_empty_expirations_null() {
        let env: ExpirationsEnvelope =
            serde_json::from_str(r#"{"expirations":null}"#).unwrap();
        assert!(env.expirations.is_none());
    }

    #[test]
    fn parses_chains_envelope_separates_calls_puts() {
        let json = r#"{"options":{"option":[
            {"strike":500.0,"option_type":"call","open_interest":1234,
             "greeks":{"gamma":0.012,"smv_vol":0.18}},
            {"strike":500.0,"option_type":"put","open_interest":2345,
             "greeks":{"gamma":0.011,"smv_vol":0.20}}
        ]}}"#;
        let env: ChainsEnvelope = serde_json::from_str(json).unwrap();
        let body = env.options.unwrap();
        assert_eq!(body.option.len(), 2);
        let call = body
            .option
            .iter()
            .find(|o| o.option_type == "call")
            .unwrap();
        assert_eq!(call.strike, 500.0);
        assert_eq!(call.open_interest, 1234);
        assert_eq!(call.greeks.as_ref().unwrap().gamma, Some(0.012));
    }
}
