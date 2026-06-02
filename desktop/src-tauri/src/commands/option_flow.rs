//! Tauri commands for the Option Flow module.
//!
//! Strategy:
//!  1. Reuse `GexState.chains_cache` when it has the requested underlying's
//!     chains — that gives us the active contracts list for free (the GEX
//!     module already pre-filtered to the next ~30 days).
//!  2. On a cache miss we fetch the chain fresh (heavy, ~5-10s).
//!  3. Filter contracts to: front 2 expirations + strikes ±10% spot. This
//!     keeps the Alpaca trades request fast (typically 50-200 contracts).
//!  4. Call `fetch_recent_trades(start_iso, symbols)` and return.
//!
//! The frontend passes `since_ms` to avoid receiving duplicate trades. We
//! subtract a 30s overlap to absorb clock skew between client and Alpaca.

use std::collections::HashMap;
use std::time::Duration;

use tauri::State;

use crate::connectors::alpaca::{
    api_key::{self},
    fetch_chains, fetch_quote, fetch_recent_trades, AlpacaClient, OptionChain, OptionTrade,
};
use crate::commands::gex::GexState;

/// 5 min — chains rarely move within a session and the GEX module
/// already caches them. This is just for option_flow's own fallback
/// when GexState hasn't been warmed yet (user opens Flow before GEX).
const CHAINS_FALLBACK_TTL: Duration = Duration::from_secs(5 * 60);
/// Front-month window. 2 covers 0DTE + nearest weekly; that's where the
/// flow lives.
const EXPIRATION_TARGET_COUNT: usize = 2;
/// Strike filter around spot.
const STRIKE_WINDOW_PCT: f64 = 0.10;
/// First-poll lookback (no since_ms provided). 16 min covers the
/// 15-min minimum delay imposed by Alpaca's free "indicative" feed.
const FIRST_POLL_LOOKBACK_SECS: i64 = 16 * 60;
/// Hard minimum delay enforced by Alpaca's free tier for historical
/// trades: requests with start more recent than this return 403. We
/// clamp `start` to `now - 16min` on every poll. Real-time access
/// (OPRA paid plan) would let us drop this to 0.
const FREE_TIER_MIN_DELAY_SECS: i64 = 16 * 60;
/// Overlap subtracted from since_ms on subsequent polls to absorb
/// clock skew between client and Alpaca.
const SINCE_OVERLAP_SECS: i64 = 30;

/// Per-symbol fallback chains cache, only consulted when GexState's
/// cache is empty.
pub struct OptionFlowState {
    pub fallback_chains: crate::connectors::finnhub::TtlCache<Vec<OptionChain>>,
}

impl OptionFlowState {
    pub fn new() -> Self {
        Self {
            fallback_chains: crate::connectors::finnhub::TtlCache::new(CHAINS_FALLBACK_TTL),
        }
    }
}

impl Default for OptionFlowState {
    fn default() -> Self {
        Self::new()
    }
}

/// Local snapshot of a leg's Greeks, copied off `OptionLeg` so we can
/// look them up by OCC symbol without holding a borrow on the chain
/// vector across the trades await point.
#[derive(Debug, Clone, Copy)]
struct GreeksSnap {
    delta: Option<f64>,
    gamma: Option<f64>,
    theta: Option<f64>,
    iv: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollArgs {
    pub symbol: String,
    /// Milliseconds since epoch. None = first poll (lookback 5 min).
    pub since_ms: Option<i64>,
}

#[tauri::command]
pub async fn option_flow_poll(
    gex_state: State<'_, GexState>,
    flow_state: State<'_, OptionFlowState>,
    args: PollArgs,
) -> Result<Vec<OptionTrade>, String> {
    let symbol = args.symbol.trim().to_uppercase();
    if symbol.is_empty() {
        return Err("symbol is required".to_string());
    }

    let keys = tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("alpaca vault: {e}"))?
        .ok_or_else(|| "Alpaca API keys not configured — set them in Settings".to_string())?;
    let client = AlpacaClient::new(keys.key_id, keys.secret_key).map_err(|e| e.to_string())?;

    // 1) Acquire chains — try GEX cache first, then our own cache,
    //    then fresh fetch.
    let gex_chains_key = format!("chains|{}", symbol);
    let flow_chains_key = format!("flow_chains|{}", symbol);
    let chains: Vec<OptionChain> = if let Some(c) = gex_state.chains_cache.get(&gex_chains_key).await {
        c
    } else if let Some(c) = flow_state.fallback_chains.get(&flow_chains_key).await {
        c
    } else {
        let fresh = fetch_chains(&client, &symbol)
            .await
            .map_err(|e| format!("alpaca chains: {e}"))?;
        flow_state
            .fallback_chains
            .set(flow_chains_key.clone(), fresh.clone())
            .await;
        fresh
    };
    if chains.is_empty() {
        return Ok(Vec::new());
    }

    // 2) Spot quote (light call).
    let spot = fetch_quote(&client, &symbol)
        .await
        .map_err(|e| format!("alpaca quote: {e}"))?;

    // 3) Build the active contracts OCC list.
    //    - Sort chains by expiration ascending, take first N.
    //    - For each chain, filter strikes within ±STRIKE_WINDOW_PCT of spot.
    //    - Reconstruct the OCC symbol per leg.
    let mut sorted_chains: Vec<&OptionChain> = chains.iter().collect();
    sorted_chains.sort_by(|a, b| a.expiration.cmp(&b.expiration));
    sorted_chains.truncate(EXPIRATION_TARGET_COUNT);

    let lower = spot * (1.0 - STRIKE_WINDOW_PCT);
    let upper = spot * (1.0 + STRIKE_WINDOW_PCT);

    let mut occ_symbols: Vec<String> = Vec::with_capacity(256);
    //    Side-effect: while we're already walking the legs, capture each
    //    contract's Greeks snapshot so the table can show delta / IV /
    //    gamma / theta per trade. Greeks are Option<f64> at the source
    //    (Alpaca omits them for deep OTM/ITM) — we forward as-is.
    let mut greeks_by_occ: HashMap<String, GreeksSnap> = HashMap::with_capacity(256);
    for chain in &sorted_chains {
        let yymmdd = compress_expiration(&chain.expiration);
        if yymmdd.is_empty() {
            continue;
        }
        for c in &chain.calls {
            if c.strike < lower || c.strike > upper {
                continue;
            }
            let occ = build_occ(&symbol, &yymmdd, 'C', c.strike);
            greeks_by_occ.insert(
                occ.clone(),
                GreeksSnap { delta: c.delta, gamma: c.gamma, theta: c.theta, iv: c.iv },
            );
            occ_symbols.push(occ);
        }
        for p in &chain.puts {
            if p.strike < lower || p.strike > upper {
                continue;
            }
            let occ = build_occ(&symbol, &yymmdd, 'P', p.strike);
            greeks_by_occ.insert(
                occ.clone(),
                GreeksSnap { delta: p.delta, gamma: p.gamma, theta: p.theta, iv: p.iv },
            );
            occ_symbols.push(occ);
        }
    }
    if occ_symbols.is_empty() {
        return Ok(Vec::new());
    }
    tracing::info!(
        "option_flow_poll: {} → {} active contracts across {} expirations",
        symbol,
        occ_symbols.len(),
        sorted_chains.len(),
    );

    // 4) Build start_iso from since_ms (with overlap) or default lookback.
    //    Clamp to `now - 16min` because the free indicative feed rejects
    //    any historical-trade request with start more recent than that.
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let max_start = now_secs - FREE_TIER_MIN_DELAY_SECS;
    let raw_start_secs = match args.since_ms {
        Some(ms) => (ms / 1000) - SINCE_OVERLAP_SECS,
        None => now_secs - FIRST_POLL_LOOKBACK_SECS,
    };
    let start_secs = raw_start_secs.min(max_start);
    let start_iso = unix_to_iso8601(start_secs);
    tracing::info!(
        "option_flow_poll: start={} (clamped from {})",
        start_iso,
        raw_start_secs,
    );

    // 5) Fetch + side-infer.
    let trades = fetch_recent_trades(&client, &occ_symbols, &start_iso)
        .await
        .map_err(|e| format!("alpaca trades: {e}"))?;

    // 6) Server-side dedup against the original since_ms threshold,
    //    and graft the Greeks snapshot onto each surviving trade.
    let cutoff = args.since_ms.unwrap_or(0);
    let filtered: Vec<OptionTrade> = trades
        .into_iter()
        .filter(|t| t.timestamp_ms > cutoff)
        .map(|mut t| {
            if let Some(g) = greeks_by_occ.get(&t.symbol) {
                t.delta = g.delta;
                t.gamma = g.gamma;
                t.theta = g.theta;
                t.iv = g.iv;
            }
            t
        })
        .collect();
    tracing::info!(
        "option_flow_poll: {} returned {} trades",
        symbol,
        filtered.len(),
    );
    Ok(filtered)
}

/// "YYYY-MM-DD" → "YYMMDD". Empty string on malformed input.
fn compress_expiration(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    if parts.len() != 3 {
        return String::new();
    }
    let yy = parts[0].get(2..).unwrap_or("");
    let mm = parts[1];
    let dd = parts[2];
    if yy.len() != 2 || mm.len() != 2 || dd.len() != 2 {
        return String::new();
    }
    format!("{}{}{}", yy, mm, dd)
}

/// Build an OCC contract symbol: UNDERLYING + YYMMDD + (C|P) + STRIKE_INT_8.
fn build_occ(underlying: &str, yymmdd: &str, ctype: char, strike: f64) -> String {
    let strike_int = (strike * 1000.0).round() as u64;
    format!("{}{}{}{:08}", underlying, yymmdd, ctype, strike_int)
}

fn unix_to_iso8601(unix_secs: i64) -> String {
    if unix_secs <= 0 {
        return "1970-01-01T00:00:00Z".to_string();
    }
    let days = unix_secs.div_euclid(86_400);
    let day_secs = unix_secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let h = day_secs / 3600;
    let mi = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, h, mi, s
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compress_expiration_roundtrip() {
        assert_eq!(compress_expiration("2026-05-18"), "260518");
        assert_eq!(compress_expiration("2030-01-01"), "300101");
    }

    #[test]
    fn compress_expiration_empty_on_bad_input() {
        assert_eq!(compress_expiration(""), "");
        assert_eq!(compress_expiration("2026-5-18"), "");
        assert_eq!(compress_expiration("bad"), "");
    }

    #[test]
    fn build_occ_matches_alpaca_format() {
        assert_eq!(
            build_occ("SPY", "260620", 'C', 500.0),
            "SPY260620C00500000"
        );
        assert_eq!(
            build_occ("QQQ", "260530", 'P', 499.5),
            "QQQ260530P00499500"
        );
    }
}
