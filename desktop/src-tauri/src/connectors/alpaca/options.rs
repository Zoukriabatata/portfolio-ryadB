//! Alpaca options snapshot + underlying quote parsers.
//!
//! Single endpoint covers everything for an underlying:
//!   GET /v1beta1/options/snapshots/{underlying}?feed=indicative
//! returns a map keyed by OCC symbol (`SPY261218C00500000`) with
//! greeks + impliedVolatility + openInterest per contract.
//!
//! We parse the OCC symbol to extract (expiration, type, strike),
//! group by expiration into `OptionChain`s, and filter on the caller
//! side (e.g. next-30-days window).

use std::collections::HashMap;

use serde::Deserialize;

use crate::connectors::alpaca::client::AlpacaClient;
use crate::connectors::alpaca::error::{AlpacaError, Result};

/// One option leg (call OR put) as exposed to the compute layer.
#[derive(Debug, Clone)]
pub struct OptionLeg {
    pub strike: f64,
    pub open_interest: u64,
    pub gamma: Option<f64>,
    pub iv: Option<f64>,
}

/// One full expiration chain split into calls + puts.
#[derive(Debug, Clone, Default)]
pub struct OptionChain {
    pub expiration: String,
    pub calls: Vec<OptionLeg>,
    pub puts: Vec<OptionLeg>,
}

// ─── Raw Alpaca JSON ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SnapshotsEnvelope {
    #[serde(default)]
    snapshots: HashMap<String, RawSnapshot>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawSnapshot {
    #[serde(default)]
    greeks: Option<RawGreeks>,
    #[serde(default, rename = "impliedVolatility")]
    implied_volatility: Option<f64>,
    #[serde(default, rename = "openInterest")]
    open_interest: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawGreeks {
    #[serde(default)]
    gamma: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LatestTradeEnvelope {
    trade: Option<LatestTrade>,
}

#[derive(Debug, Deserialize)]
struct LatestTrade {
    /// Trade price.
    p: f64,
}

/// Parse an OCC option symbol like "SPY261218C00500000" into
/// (underlying, expiration ISO, option_type 'C'|'P', strike).
/// Returns None on malformed input.
pub fn parse_occ_symbol(occ: &str) -> Option<(String, String, char, f64)> {
    if occ.len() < 15 {
        return None;
    }
    let bytes = occ.as_bytes();
    let n = occ.len();

    let strike_str = std::str::from_utf8(&bytes[n - 8..n]).ok()?;
    let strike_int: u64 = strike_str.parse().ok()?;
    let strike = strike_int as f64 / 1000.0;

    let opt_type = bytes[n - 9] as char;
    if opt_type != 'C' && opt_type != 'P' {
        return None;
    }

    let yy: u32 = std::str::from_utf8(&bytes[n - 15..n - 13]).ok()?.parse().ok()?;
    let mm: u32 = std::str::from_utf8(&bytes[n - 13..n - 11]).ok()?.parse().ok()?;
    let dd: u32 = std::str::from_utf8(&bytes[n - 11..n - 9]).ok()?.parse().ok()?;
    if !(1..=12).contains(&mm) || !(1..=31).contains(&dd) {
        return None;
    }
    let year = 2000 + yy;
    let expiration = format!("{:04}-{:02}-{:02}", year, mm, dd);

    let underlying = std::str::from_utf8(&bytes[..n - 15])
        .ok()?
        .trim()
        .to_string();
    if underlying.is_empty() {
        return None;
    }

    Some((underlying, expiration, opt_type, strike))
}

async fn fetch_all_snapshots(
    client: &AlpacaClient,
    underlying: &str,
) -> Result<HashMap<String, RawSnapshot>> {
    let path = format!("v1beta1/options/snapshots/{}", underlying);
    let mut all: HashMap<String, RawSnapshot> = HashMap::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut query: Vec<(&str, &str)> =
            vec![("feed", "indicative"), ("limit", "1000")];
        if let Some(ref tok) = page_token {
            query.push(("page_token", tok));
        }
        let env: SnapshotsEnvelope = client.get_json(&path, &query).await?;
        for (k, v) in env.snapshots {
            all.insert(k, v);
        }
        match env.next_page_token {
            Some(t) if !t.is_empty() => page_token = Some(t),
            _ => break,
        }
        if all.len() >= 20_000 {
            tracing::warn!(
                "alpaca options snapshots: hit 20k cap for {}, stopping pagination",
                underlying
            );
            break;
        }
    }
    Ok(all)
}

/// Fetch + parse all chains for the underlying.
pub async fn fetch_chains(
    client: &AlpacaClient,
    underlying: &str,
) -> Result<Vec<OptionChain>> {
    let snapshots = fetch_all_snapshots(client, underlying).await?;
    tracing::info!(
        "alpaca options: {} got {} contract snapshots",
        underlying,
        snapshots.len()
    );

    let mut by_expiry: HashMap<String, OptionChain> = HashMap::new();
    for (occ, snap) in snapshots {
        let parsed = match parse_occ_symbol(&occ) {
            Some(p) => p,
            None => continue,
        };
        let (_underlying, expiration, opt_type, strike) = parsed;
        let leg = OptionLeg {
            strike,
            open_interest: snap.open_interest.unwrap_or(0),
            gamma: snap.greeks.as_ref().and_then(|g| g.gamma),
            iv: snap.implied_volatility,
        };
        let entry = by_expiry
            .entry(expiration.clone())
            .or_insert_with(|| OptionChain {
                expiration: expiration.clone(),
                calls: Vec::new(),
                puts: Vec::new(),
            });
        match opt_type {
            'C' => entry.calls.push(leg),
            'P' => entry.puts.push(leg),
            _ => {}
        }
    }

    let mut chains: Vec<OptionChain> = by_expiry.into_values().collect();
    chains.sort_by(|a, b| a.expiration.cmp(&b.expiration));
    Ok(chains)
}

/// Fetch the latest underlying trade price (acts as spot).
pub async fn fetch_quote(client: &AlpacaClient, symbol: &str) -> Result<f64> {
    let path = format!("v2/stocks/{}/trades/latest", symbol);
    let env: LatestTradeEnvelope = client.get_json(&path, &[]).await?;
    env.trade
        .map(|t| t.p)
        .ok_or_else(|| AlpacaError::Decode("missing latest trade".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_occ_symbol() {
        let parsed = parse_occ_symbol("SPY261218C00500000").unwrap();
        assert_eq!(parsed.0, "SPY");
        assert_eq!(parsed.1, "2026-12-18");
        assert_eq!(parsed.2, 'C');
        assert_eq!(parsed.3, 500.0);
    }

    #[test]
    fn parses_put_with_decimal_strike() {
        let parsed = parse_occ_symbol("QQQ260530P00499500").unwrap();
        assert_eq!(parsed.0, "QQQ");
        assert_eq!(parsed.1, "2026-05-30");
        assert_eq!(parsed.2, 'P');
        assert!((parsed.3 - 499.5).abs() < 1e-9);
    }

    #[test]
    fn rejects_malformed_symbols() {
        assert!(parse_occ_symbol("").is_none());
        assert!(parse_occ_symbol("SHORT").is_none());
        assert!(parse_occ_symbol("SPY261299X00500000").is_none());
    }

    #[test]
    fn parses_snapshots_envelope() {
        let json = r#"{
            "snapshots": {
                "SPY261218C00500000": {
                    "greeks": {"gamma": 0.012},
                    "impliedVolatility": 0.18,
                    "openInterest": 1234
                },
                "SPY261218P00495000": {
                    "greeks": {"gamma": 0.011},
                    "impliedVolatility": 0.20,
                    "openInterest": 2345
                }
            },
            "next_page_token": null
        }"#;
        let env: SnapshotsEnvelope = serde_json::from_str(json).unwrap();
        assert_eq!(env.snapshots.len(), 2);
        assert!(env.next_page_token.is_none());
        let call = env.snapshots.get("SPY261218C00500000").unwrap();
        assert_eq!(call.open_interest, Some(1234));
        assert_eq!(call.greeks.as_ref().unwrap().gamma, Some(0.012));
        assert_eq!(call.implied_volatility, Some(0.18));
    }

    #[test]
    fn parses_latest_trade_envelope() {
        let json = r#"{"symbol":"SPY","trade":{"p":500.10,"s":100,"t":"2026-05-18T14:00:00Z"}}"#;
        let env: LatestTradeEnvelope = serde_json::from_str(json).unwrap();
        assert!((env.trade.unwrap().p - 500.10).abs() < 1e-9);
    }
}
