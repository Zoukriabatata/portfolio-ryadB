//! Databento OPRA connector — option chain snapshot + recent trades.
//!
//! Strategy (GEX):
//!  1. Fetch `definition` records for today to discover all OCC symbols
//!     for the underlying (strike, expiry, call/put, open interest).
//!  2. Filter to front 2 expirations within ±15% of spot.
//!  3. Fetch `mbbo` (best bid/offer) for those symbols over the last 15 min.
//!  4. Compute IV + Greeks via Black-Scholes for each option leg.
//!  5. Build `OptionChain` structs for the existing `compute_gex` function.
//!
//! Strategy (Option Flow):
//!  - Fetch `trades` records for the underlying's option chain since
//!    `since_ms`, return `OptionTrade` structs (same type as Alpaca module).
//!
//! Auth: HTTP Basic auth — api_key as username, empty password.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::Value;

use crate::connectors::alpaca::options::{OptionChain, OptionLeg};
use crate::connectors::alpaca::trades::{ContractType, OptionTrade, TradeSide};
use super::black_scholes::compute_greeks;

const BASE: &str = "https://hist.databento.com/v0/timeseries.get_range";
const DATASET: &str = "OPRA.PILLAR";
/// Approximate SPY/QQQ dividend yield.
const DIVIDEND_YIELD: f64 = 0.014;
/// Approximate risk-free rate.
const RISK_FREE_RATE: f64 = 0.053;
const STRIKE_WINDOW_PCT: f64 = 0.15;
const EXPIRATION_TARGET: usize = 2;
/// Look-back window for MBBO price fetch (seconds).
const PRICE_WINDOW_SECS: i64 = 15 * 60;
/// `stat_type` value for Open Interest in Databento statistics schema.
const STAT_TYPE_OI: u64 = 9;

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async fn fetch_ndjson(api_key: &str, params: &[(&str, &str)]) -> Result<Vec<Value>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(BASE)
        .basic_auth(api_key, Some(""))
        .query(params)
        .send()
        .await
        .map_err(|e| format!("databento HTTP: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("databento {status}: {body}"));
    }

    let text = resp.text().await.map_err(|e| e.to_string())?;
    let records = text
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('#')
        })
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .collect();

    Ok(records)
}

// ─── Timestamp helpers ───────────────────────────────────────────────────────

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn unix_to_iso(secs: i64) -> String {
    if secs <= 0 { return "1970-01-01T00:00:00".to_string(); }
    let days  = secs.div_euclid(86_400);
    let day_s = secs.rem_euclid(86_400);
    let z     = days + 719_468;
    let era   = z.div_euclid(146_097);
    let doe   = (z - era * 146_097) as u32;
    let yoe   = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y     = yoe as i32 + era as i32 * 400;
    let doy   = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp    = (5 * doy + 2) / 153;
    let d     = doy - (153 * mp + 2) / 5 + 1;
    let m     = if mp < 10 { mp + 3 } else { mp - 9 };
    let y     = if m <= 2 { y + 1 } else { y };
    let h     = day_s / 3600;
    let mi    = (day_s % 3600) / 60;
    let s     = day_s % 60;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}", y, m, d, h, mi, s)
}

fn today_start_iso(now_secs: i64) -> String {
    unix_to_iso(now_secs - (now_secs % 86_400))
}

/// Nanosecond epoch to ISO 8601 string (for trade timestamps).
fn ns_to_iso(ns: u64) -> String {
    let secs = (ns / 1_000_000_000) as i64;
    let nanos = (ns % 1_000_000_000) as u32;
    let base = unix_to_iso(secs);
    format!("{}.{:09}Z", base, nanos)
}

// ─── Expiry helpers ──────────────────────────────────────────────────────────

/// Years to expiry from now_secs. Returns 0.0 for expired options.
fn years_to_expiry(expiry_date: &str, now_secs: i64) -> f64 {
    let parts: Vec<&str> = expiry_date.split('-').collect();
    if parts.len() != 3 { return 0.0; }
    let y: i32 = parts[0].parse().unwrap_or(0);
    let m: u32 = parts[1].parse().unwrap_or(0);
    let d: u32 = parts[2].parse().unwrap_or(0);
    if y == 0 || m == 0 || d == 0 { return 0.0; }
    let yc  = if m <= 2 { y - 1 } else { y };
    let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
    let yoe = (yc - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era as i64 * 146_097 + doe as i64 - 719_468;
    let delta = days * 86_400 - now_secs;
    if delta <= 0 { 0.0 } else { delta as f64 / 31_557_600.0 }
}

/// Extract YYYY-MM-DD from an OCC symbol's YYMMDD component.
fn yymmdd_to_date(yymmdd: &str) -> Option<String> {
    if yymmdd.len() != 6 { return None; }
    let yy: u32 = yymmdd[..2].parse().ok()?;
    let mm: u32 = yymmdd[2..4].parse().ok()?;
    let dd: u32 = yymmdd[4..6].parse().ok()?;
    Some(format!("{:04}-{:02}-{:02}", 2000 + yy, mm, dd))
}

/// Parse an OCC symbol → (expiry "YYYY-MM-DD", is_call, strike).
fn parse_occ_local(occ: &str) -> Option<(String, bool, f64)> {
    let date_start = occ.bytes().position(|b| b.is_ascii_digit())?;
    if occ.len() < date_start + 15 { return None; }
    let expiry  = yymmdd_to_date(&occ[date_start..date_start + 6])?;
    let cp      = *occ.as_bytes().get(date_start + 6)?;
    let is_call = matches!(cp, b'C' | b'c');
    let int: u64 = occ[date_start + 7..].parse().ok()?;
    Some((expiry, is_call, int as f64 / 1000.0))
}

// ─── Spot price ──────────────────────────────────────────────────────────────

/// Latest trade price for an equity from Databento ARCX.PILLAR.
pub async fn fetch_spot(api_key: &str, symbol: &str) -> Result<f64, String> {
    let now = unix_now();
    let records = fetch_ndjson(api_key, &[
        ("dataset", "ARCX.PILLAR"),
        ("symbols", symbol),
        ("stype_in", "raw_symbol"),
        ("schema", "trades"),
        ("start", &unix_to_iso(now - 900)),
        ("end", &unix_to_iso(now)),
        ("encoding", "json"),
        ("pretty_px", "true"),
        ("map_symbols", "true"),
    ]).await?;

    Ok(records.into_iter().rev()
        .filter_map(|r| r.get("price").and_then(|v| v.as_f64()))
        .find(|&p| p > 0.0)
        .unwrap_or(0.0))
}

// ─── Option chain (for GEX) ──────────────────────────────────────────────────

struct DefRecord {
    occ: String,
    expiry: String,
    is_call: bool,
    strike: f64,
    open_interest: u64,
}

async fn fetch_definitions(
    api_key: &str,
    underlying: &str,
    start: &str,
    end: &str,
) -> Result<Vec<DefRecord>, String> {
    let records = fetch_ndjson(api_key, &[
        ("dataset", DATASET),
        ("symbols", underlying),
        ("stype_in", "parent"),
        ("schema", "definition"),
        ("start", start),
        ("end", end),
        ("encoding", "json"),
        ("pretty_px", "true"),
        ("map_symbols", "true"),
    ]).await?;

    tracing::info!("databento definitions: {} records for {underlying}", records.len());

    let mut seen: HashMap<String, DefRecord> = HashMap::new();
    for rec in records {
        let occ = rec.get("raw_symbol")
            .or_else(|| rec.get("symbol"))
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let occ = match occ { Some(s) if !s.is_empty() => s, _ => continue };

        let (expiry, is_call, strike) = match parse_occ_local(&occ) {
            Some(p) => p,
            None => continue,
        };
        let oi = rec.get("open_interest_qty")
            .or_else(|| rec.get("open_interest"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        seen.entry(occ.clone()).or_insert(DefRecord { occ, expiry, is_call, strike, open_interest: oi });
    }
    Ok(seen.into_values().collect())
}

async fn fetch_oi_from_statistics(
    api_key: &str,
    occs: &[String],
    start: &str,
    end: &str,
) -> HashMap<String, u64> {
    if occs.is_empty() { return HashMap::new(); }
    let csv = occs.join(",");
    let records = match fetch_ndjson(api_key, &[
        ("dataset", DATASET),
        ("symbols", &csv),
        ("stype_in", "raw_symbol"),
        ("schema", "statistics"),
        ("start", start),
        ("end", end),
        ("encoding", "json"),
        ("map_symbols", "true"),
    ]).await {
        Ok(r) => r,
        Err(e) => { tracing::warn!("databento statistics: {e}"); return HashMap::new(); }
    };

    let mut map: HashMap<String, u64> = HashMap::new();
    for rec in records {
        if rec.get("stat_type").and_then(|v| v.as_u64()).unwrap_or(u64::MAX) != STAT_TYPE_OI {
            continue;
        }
        let sym = rec.get("symbol").or_else(|| rec.get("raw_symbol"))
            .and_then(|v| v.as_str()).map(str::to_string);
        let qty = rec.get("quantity").or_else(|| rec.get("price"))
            .and_then(|v| v.as_f64()).map(|f| f.abs() as u64).unwrap_or(0);
        if let Some(s) = sym { map.insert(s, qty); }
    }
    map
}

async fn fetch_mbbo_prices(
    api_key: &str,
    occs: &[String],
    start: &str,
    end: &str,
) -> Result<HashMap<String, (f64, f64)>, String> {
    if occs.is_empty() { return Ok(HashMap::new()); }
    let csv = occs.join(",");
    let records = fetch_ndjson(api_key, &[
        ("dataset", DATASET),
        ("symbols", &csv),
        ("stype_in", "raw_symbol"),
        ("schema", "mbbo"),
        ("start", start),
        ("end", end),
        ("encoding", "json"),
        ("pretty_px", "true"),
        ("map_symbols", "true"),
    ]).await?;

    let mut prices: HashMap<String, (f64, f64)> = HashMap::new();
    for rec in records {
        let sym = rec.get("symbol").or_else(|| rec.get("raw_symbol"))
            .and_then(|v| v.as_str()).map(str::to_string);
        let bid = rec.get("bid_px_00").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ask = rec.get("ask_px_00").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if let Some(s) = sym {
            if bid > 0.0 || ask > 0.0 { prices.insert(s, (bid, ask)); }
        }
    }
    Ok(prices)
}

/// Build `Vec<OptionChain>` from Databento OPRA data.
/// Compatible with the existing `compute_gex` function.
pub async fn fetch_option_chain(
    api_key: &str,
    underlying: &str,
    spot: f64,
) -> Result<Vec<OptionChain>, String> {
    if spot <= 0.0 { return Err("spot must be > 0".to_string()); }

    let now = unix_now();
    let start_today = today_start_iso(now);
    let end_now     = unix_to_iso(now);

    // Step 1 — definitions (structure + OI)
    let mut defs = fetch_definitions(api_key, underlying, &start_today, &end_now).await?;

    // Step 2 — filter to front N expirations
    let today_date = &start_today[..10];
    let mut expiries: Vec<String> = defs.iter().map(|d| d.expiry.clone()).collect();
    expiries.sort(); expiries.dedup();
    expiries.retain(|e| e.as_str() > today_date);
    expiries.truncate(EXPIRATION_TARGET);
    defs.retain(|d| expiries.contains(&d.expiry));

    // Step 3 — filter strikes ±15%
    let lo = spot * (1.0 - STRIKE_WINDOW_PCT);
    let hi = spot * (1.0 + STRIKE_WINDOW_PCT);
    defs.retain(|d| d.strike >= lo && d.strike <= hi);

    if defs.is_empty() {
        tracing::warn!("databento: no options in strike window for {underlying} @ {spot}");
        return Ok(Vec::new());
    }
    tracing::info!("databento: {} option legs for {underlying} after filtering", defs.len());

    let occs: Vec<String> = defs.iter().map(|d| d.occ.clone()).collect();

    // Step 4 — OI fallback if definitions lacked it
    let oi_map = if defs.iter().all(|d| d.open_interest == 0) {
        tracing::info!("databento: fetching OI from statistics schema");
        fetch_oi_from_statistics(api_key, &occs, &start_today, &end_now).await
    } else {
        HashMap::new()
    };

    // Step 5 — current prices (last 15 min)
    let price_start = unix_to_iso(now - PRICE_WINDOW_SECS);
    let prices = fetch_mbbo_prices(api_key, &occs, &price_start, &end_now).await?;

    // Step 6 — Greeks + build chains
    let mut chains: HashMap<String, OptionChain> = HashMap::new();
    for def in &defs {
        let (bid, ask) = prices.get(&def.occ).copied().unwrap_or((0.0, 0.0));
        let mid = match (bid, ask) {
            (b, a) if b > 0.0 && a > 0.0 => (b + a) * 0.5,
            (_, a) if a > 0.0 => a,
            (b, _) => b,
        };
        let oi = if def.open_interest > 0 { def.open_interest }
                 else { oi_map.get(&def.occ).copied().unwrap_or(0) };

        let t = years_to_expiry(&def.expiry, now);
        if t <= 0.0 { continue; }

        let g = if mid > 0.0 {
            compute_greeks(mid, spot, def.strike, t, RISK_FREE_RATE, DIVIDEND_YIELD, def.is_call)
        } else {
            None
        };

        let leg = OptionLeg {
            strike: def.strike,
            open_interest: oi,
            delta: g.map(|x| x.delta),
            gamma: g.map(|x| x.gamma),
            theta: g.map(|x| x.theta),
            vega:  g.map(|x| x.vega),
            rho:   None,
            iv:    g.map(|x| x.iv),
        };

        let chain = chains.entry(def.expiry.clone()).or_insert_with(|| OptionChain {
            expiration: def.expiry.clone(),
            calls: Vec::new(),
            puts:  Vec::new(),
        });
        if def.is_call { chain.calls.push(leg); } else { chain.puts.push(leg); }
    }

    Ok(chains.into_values().collect())
}

// ─── Option Flow trades ──────────────────────────────────────────────────────

pub async fn fetch_recent_trades(
    api_key: &str,
    underlying: &str,
    since_ms: Option<i64>,
) -> Result<Vec<OptionTrade>, String> {
    let now = unix_now();
    let start_secs = match since_ms {
        Some(ms) => (ms / 1000) - 30, // 30s overlap for clock skew
        None => now - 5 * 60,
    };

    let records = fetch_ndjson(api_key, &[
        ("dataset", DATASET),
        ("symbols", underlying),
        ("stype_in", "parent"),
        ("schema", "trades"),
        ("start", &unix_to_iso(start_secs)),
        ("end", &unix_to_iso(now)),
        ("encoding", "json"),
        ("pretty_px", "true"),
        ("map_symbols", "true"),
    ]).await?;

    tracing::info!("databento trades: {} records for {underlying}", records.len());

    let cutoff_ms = since_ms.unwrap_or(0);
    let mut trades: Vec<OptionTrade> = Vec::new();

    for rec in records {
        let occ = rec.get("symbol").or_else(|| rec.get("raw_symbol"))
            .and_then(|v| v.as_str()).map(str::to_string);
        let occ = match occ { Some(s) if !s.is_empty() => s, _ => continue };

        let (expiry, is_call, strike) = match parse_occ_local(&occ) { Some(p) => p, None => continue };

        // ts_recv: nanoseconds since epoch as u64
        let ts_ns = rec.get("ts_recv").and_then(|v| v.as_u64()).unwrap_or(0);
        let ts_ms = (ts_ns / 1_000_000) as i64;
        if ts_ms <= cutoff_ms { continue; }

        let price   = rec.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let size    = rec.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
        let premium = price * size as f64 * 100.0;
        let side    = match rec.get("side").and_then(|v| v.as_str()) {
            Some("B") | Some("b") => TradeSide::Buy,
            Some("A") | Some("a") => TradeSide::Sell,
            _ => TradeSide::Unknown,
        };

        trades.push(OptionTrade {
            symbol: occ,
            underlying: underlying.to_string(),
            expiration: expiry,
            strike,
            contract_type: if is_call { ContractType::Call } else { ContractType::Put },
            timestamp: ns_to_iso(ts_ns),
            timestamp_ms: ts_ms,
            price,
            size,
            premium,
            exchange: "OPRA".to_string(),
            side,
            delta: None,
            gamma: None,
            theta: None,
            iv: None,
            open_interest: None,
        });
    }

    Ok(trades)
}
