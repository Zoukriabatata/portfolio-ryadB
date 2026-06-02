//! Alpaca options historical trades fetcher.
//!
//! Endpoint:  GET /v1beta1/options/trades?symbols=A,B,C&start=...&limit=10000
//! Endpoint:  GET /v1beta1/options/quotes/latest?symbols=A,B,C
//!
//! For a given list of OCC contract symbols we fetch trades between
//! `start_iso` and now, then enrich each trade with a side inference
//! (buy/sell/mid) using the *latest* NBBO quote per contract. This is
//! an approximation — exact tick-by-tick quote matching would need
//! historical quotes. Good enough for a live feed UX.
//!
//! The endpoint is symbol-major (sorts by symbol first then timestamp),
//! so we may need pagination when fetching across many contracts. We
//! page through `next_page_token` until exhausted or a hard cap of 10k
//! trades to protect memory.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::connectors::alpaca::client::AlpacaClient;
use crate::connectors::alpaca::error::{AlpacaError, Result};
use crate::connectors::alpaca::options::parse_occ_symbol;

const TRADES_PATH: &str = "/v1beta1/options/trades";
const LATEST_QUOTES_PATH: &str = "/v1beta1/options/quotes/latest";
const MAX_SYMBOLS_PER_REQUEST: usize = 100;
const MAX_TRADES_PER_FETCH: usize = 10_000;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TradeSide {
    Buy,
    Sell,
    Mid,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ContractType {
    Call,
    Put,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionTrade {
    /// Full OCC symbol — used as a stable identity key on the frontend.
    pub symbol: String,
    pub underlying: String,
    pub expiration: String,
    pub strike: f64,
    pub contract_type: ContractType,
    /// ISO 8601 timestamp from Alpaca.
    pub timestamp: String,
    /// Milliseconds since epoch — convenient for sort & dedupe.
    pub timestamp_ms: i64,
    pub price: f64,
    pub size: u64,
    /// price × size × 100 (standard equity-option multiplier).
    pub premium: f64,
    pub exchange: String,
    /// Buy / sell / mid / unknown — heuristic from latest NBBO.
    pub side: TradeSide,
    /// Greeks from the latest chain snapshot. `None` for deep OTM/ITM
    /// legs where Alpaca omits them, or when the trade's contract isn't
    /// in the active chain window. Filled in `option_flow_poll`, not
    /// here — the trades fetcher doesn't know which chain a leg lives in.
    #[serde(default)]
    pub delta: Option<f64>,
    #[serde(default)]
    pub gamma: Option<f64>,
    #[serde(default)]
    pub theta: Option<f64>,
    /// Implied vol as a decimal (0.28 = 28%).
    #[serde(default)]
    pub iv: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct TradesEnvelope {
    #[serde(default)]
    trades: HashMap<String, Vec<RawTrade>>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawTrade {
    /// RFC 3339 timestamp.
    t: String,
    /// Exchange code.
    #[serde(default)]
    x: Option<String>,
    /// Price.
    p: f64,
    /// Size.
    s: u64,
}

#[derive(Debug, Deserialize)]
struct LatestQuotesEnvelope {
    #[serde(default)]
    quotes: HashMap<String, RawQuote>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawQuote {
    #[serde(default)]
    ap: Option<f64>, // ask price
    #[serde(default)]
    bp: Option<f64>, // bid price
}

/// Side inference from the latest NBBO. None when the trade or quote
/// data is incomplete.
fn infer_side(price: f64, quote: Option<&RawQuote>) -> TradeSide {
    let Some(q) = quote else {
        return TradeSide::Unknown;
    };
    let (bid, ask) = match (q.bp, q.ap) {
        (Some(b), Some(a)) if a > b => (b, a),
        _ => return TradeSide::Unknown,
    };
    // Use the strict comparisons against the quote sides.
    if price >= ask {
        TradeSide::Buy
    } else if price <= bid {
        TradeSide::Sell
    } else {
        TradeSide::Mid
    }
}

/// Parse Alpaca's RFC3339 timestamps to milliseconds since epoch.
/// Returns 0 on malformed input — caller can filter on > 0.
fn iso_to_ms(iso: &str) -> i64 {
    // Format: "2025-01-15T14:32:10.123456789Z" — variable fractional
    // seconds. We do a minimal hand-rolled parse to avoid pulling in
    // chrono just for this. Pre: input is UTC ("Z" suffix).
    if iso.len() < 20 {
        return 0;
    }
    let bytes = iso.as_bytes();
    let parse_n = |a: usize, b: usize| -> Option<i64> {
        std::str::from_utf8(&bytes[a..b]).ok()?.parse().ok()
    };
    let year = parse_n(0, 4).unwrap_or(0);
    let month = parse_n(5, 7).unwrap_or(0);
    let day = parse_n(8, 10).unwrap_or(0);
    let hour = parse_n(11, 13).unwrap_or(0);
    let min = parse_n(14, 16).unwrap_or(0);
    let sec = parse_n(17, 19).unwrap_or(0);
    if year == 0 || month == 0 || day == 0 {
        return 0;
    }
    // days_from_civil (Hinnant)
    let yc = if month <= 2 { year - 1 } else { year };
    let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
    let yoe = (yc - era * 400) as i64;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let mut ms = days * 86_400_000 + hour * 3_600_000 + min * 60_000 + sec * 1_000;
    // Fractional seconds : everything between '.' and 'Z'.
    if let Some(dot) = iso.as_bytes().iter().position(|&b| b == b'.') {
        let end = iso.as_bytes().iter().position(|&b| b == b'Z').unwrap_or(iso.len());
        if end > dot + 1 {
            let frac = std::str::from_utf8(&iso.as_bytes()[dot + 1..end])
                .unwrap_or("0");
            // Treat the first 3 digits as milliseconds.
            let trimmed: String = frac.chars().take(3).collect();
            let pad: usize = 3usize.saturating_sub(trimmed.len());
            let normalized = format!("{}{}", trimmed, "0".repeat(pad));
            let frac_ms: i64 = normalized.parse().unwrap_or(0);
            ms += frac_ms;
        }
    }
    ms
}

/// Fetch trades for the given OCC symbols between `start_iso` and now.
/// `start_iso` must be a UTC RFC3339 timestamp (e.g. "2026-05-18T13:30:00Z").
///
/// Splits into batches of `MAX_SYMBOLS_PER_REQUEST` to keep URL size
/// sane on big chains. Pages internally via `next_page_token`.
pub async fn fetch_recent_trades(
    client: &AlpacaClient,
    symbols: &[String],
    start_iso: &str,
) -> Result<Vec<OptionTrade>> {
    if symbols.is_empty() {
        return Ok(Vec::new());
    }

    let mut out: Vec<OptionTrade> = Vec::with_capacity(256);
    let limit_str = MAX_TRADES_PER_FETCH.to_string();

    // Fetch latest quotes once per batch; reused for every trade in the
    // batch. Stored alongside the trades fetch.
    for chunk in symbols.chunks(MAX_SYMBOLS_PER_REQUEST) {
        let syms_joined = chunk.join(",");

        // 1) Parallel: trades (paged) + latest quotes (single call).
        let quotes_fut = fetch_latest_quotes(client, &syms_joined);
        let trades_fut = fetch_trades_paged(client, &syms_joined, start_iso, &limit_str);
        let (quotes_res, trades_res) = tokio::join!(quotes_fut, trades_fut);

        let quotes = quotes_res.unwrap_or_default();
        let raw_trades = trades_res?;

        // 2) Map each raw trade → OptionTrade with side inference.
        for (occ, trades) in raw_trades {
            let parsed = match parse_occ_symbol(&occ) {
                Some(p) => p,
                None => continue, // skip malformed contract symbols
            };
            let (underlying, expiration, type_char, strike) = parsed;
            let ctype = if type_char == 'C' {
                ContractType::Call
            } else {
                ContractType::Put
            };
            let quote = quotes.get(&occ);

            for t in trades {
                let ts_ms = iso_to_ms(&t.t);
                if ts_ms == 0 {
                    continue;
                }
                let premium = t.p * t.s as f64 * 100.0;
                out.push(OptionTrade {
                    symbol: occ.clone(),
                    underlying: underlying.clone(),
                    expiration: expiration.clone(),
                    strike,
                    contract_type: ctype,
                    timestamp: t.t,
                    timestamp_ms: ts_ms,
                    price: t.p,
                    size: t.s,
                    premium,
                    exchange: t.x.unwrap_or_default(),
                    side: infer_side(t.p, quote),
                    delta: None,
                    gamma: None,
                    theta: None,
                    iv: None,
                });
            }
        }
    }

    // Newest first.
    out.sort_by(|a, b| b.timestamp_ms.cmp(&a.timestamp_ms));
    Ok(out)
}

async fn fetch_trades_paged(
    client: &AlpacaClient,
    syms_joined: &str,
    start_iso: &str,
    limit_str: &str,
) -> Result<HashMap<String, Vec<RawTrade>>> {
    let mut accumulator: HashMap<String, Vec<RawTrade>> = HashMap::new();
    let mut page_token: Option<String> = None;
    let mut total = 0usize;

    loop {
        let mut query: Vec<(&str, &str)> = vec![
            ("symbols", syms_joined),
            ("start", start_iso),
            ("limit", limit_str),
        ];
        if let Some(tok) = page_token.as_deref() {
            query.push(("page_token", tok));
        }

        let env: TradesEnvelope = client.get_json(TRADES_PATH, &query).await?;
        for (k, v) in env.trades {
            total += v.len();
            accumulator.entry(k).or_default().extend(v);
        }
        if total >= MAX_TRADES_PER_FETCH {
            break;
        }
        match env.next_page_token {
            Some(t) if !t.is_empty() => page_token = Some(t),
            _ => break,
        }
    }
    Ok(accumulator)
}

async fn fetch_latest_quotes(
    client: &AlpacaClient,
    syms_joined: &str,
) -> Result<HashMap<String, RawQuote>> {
    let query = [("symbols", syms_joined)];
    let env: LatestQuotesEnvelope = client.get_json(LATEST_QUOTES_PATH, &query).await?;
    Ok(env.quotes)
}

// Allow ignored AlpacaError unwraps in mod-internal helpers when the
// downstream caller forwards a higher-level error.
#[allow(dead_code)]
fn _silence_unused(e: AlpacaError) -> AlpacaError {
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_to_ms_parses_utc_with_millis() {
        // 2026-05-18T13:30:00.500Z
        let ms = iso_to_ms("2026-05-18T13:30:00.500Z");
        // Compute the expected epoch ms independently:
        //  days from civil for 2026-05-18 (Hinnant) = 20591
        //  20591 * 86_400_000 = 1_779_062_400_000
        //  + 13*3600s = 1_779_062_400_000 + 13*3_600_000 + 30*60_000 + 500
        let expected: i64 =
            20_591i64 * 86_400_000 + 13 * 3_600_000 + 30 * 60_000 + 500;
        assert_eq!(ms, expected);
    }

    #[test]
    fn iso_to_ms_returns_zero_on_garbage() {
        assert_eq!(iso_to_ms(""), 0);
        assert_eq!(iso_to_ms("not-a-timestamp"), 0);
    }

    #[test]
    fn infer_side_buy_when_at_or_above_ask() {
        let q = RawQuote { bp: Some(1.0), ap: Some(1.10) };
        assert!(matches!(infer_side(1.10, Some(&q)), TradeSide::Buy));
        assert!(matches!(infer_side(1.20, Some(&q)), TradeSide::Buy));
    }

    #[test]
    fn infer_side_sell_when_at_or_below_bid() {
        let q = RawQuote { bp: Some(1.0), ap: Some(1.10) };
        assert!(matches!(infer_side(1.0, Some(&q)), TradeSide::Sell));
        assert!(matches!(infer_side(0.95, Some(&q)), TradeSide::Sell));
    }

    #[test]
    fn infer_side_mid_when_between_bid_and_ask() {
        let q = RawQuote { bp: Some(1.0), ap: Some(1.10) };
        assert!(matches!(infer_side(1.05, Some(&q)), TradeSide::Mid));
    }

    #[test]
    fn infer_side_unknown_without_quote() {
        assert!(matches!(infer_side(1.0, None), TradeSide::Unknown));
    }
}
