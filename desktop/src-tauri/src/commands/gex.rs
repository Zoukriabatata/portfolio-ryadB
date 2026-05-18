//! Tauri commands for the GEX module. One snapshot endpoint plus
//! three API-key endpoints. Backed by the Alpaca Market Data API.

use std::time::Duration;

use tauri::State;

use crate::connectors::alpaca::{
    api_key::{self, AlpacaKeys},
    compute_gex, fetch_chains, fetch_quote, AlpacaClient, GexSnapshot, OptionChain,
};
use crate::connectors::finnhub::TtlCache;

/// 15 min — chains move slowly; this protects the rate limit from
/// accidental rapid refreshes.
const SNAPSHOT_TTL: Duration = Duration::from_secs(15 * 60);
/// Filter expirations to the next N days (covers 0DTE, weeklies, front
/// monthly). 30 is the standard GEX horizon.
const EXPIRATION_WINDOW_DAYS: i64 = 30;

pub struct GexState {
    pub cache: TtlCache<GexSnapshot>,
}

impl GexState {
    pub fn new() -> Self {
        Self {
            cache: TtlCache::new(SNAPSHOT_TTL),
        }
    }
}

impl Default for GexState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchGexArgs {
    pub symbol: String, // "SPY" | "QQQ"
}

#[tauri::command]
pub async fn gex_fetch_snapshot(
    state: State<'_, GexState>,
    args: FetchGexArgs,
) -> Result<GexSnapshot, String> {
    let cache_key = format!("gex|{}", args.symbol);
    if let Some(mut hit) = state.cache.get(&cache_key).await {
        tracing::info!("gex_fetch_snapshot: cache hit {}", args.symbol);
        hit.stale = false;
        return Ok(hit);
    }

    let keys = tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("alpaca vault: {e}"))?
        .ok_or_else(|| "Alpaca API keys not configured — set them in Settings".to_string())?;
    let client = AlpacaClient::new(keys.key_id, keys.secret_key).map_err(|e| e.to_string())?;

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let cutoff_secs = now_secs + EXPIRATION_WINDOW_DAYS * 86_400;

    // Single Alpaca call gets the entire option chain across all expirations.
    let all_chains = fetch_chains(&client, &args.symbol)
        .await
        .map_err(|e| format!("alpaca chains: {e}"))?;

    // Filter to expirations within window.
    let filtered: Vec<OptionChain> = all_chains
        .into_iter()
        .filter(|chain| {
            let exp_secs = parse_expiration_to_unix(&chain.expiration);
            exp_secs >= now_secs && exp_secs <= cutoff_secs
        })
        .collect();
    tracing::info!(
        "gex_fetch_snapshot: {} kept {} expirations within {} days",
        args.symbol,
        filtered.len(),
        EXPIRATION_WINDOW_DAYS,
    );

    let spot = fetch_quote(&client, &args.symbol)
        .await
        .map_err(|e| format!("alpaca quote: {e}"))?;

    let computed_at = unix_to_iso8601(now_secs);
    let snap = compute_gex(&args.symbol, spot, &filtered, computed_at, now_secs);
    tracing::info!(
        "gex_fetch_snapshot: {} computed {} strikes, total_gex={:.2}",
        args.symbol,
        snap.strikes.len(),
        snap.total_gex,
    );

    state.cache.set(cache_key, snap.clone()).await;
    Ok(snap)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveApiKeyArgs {
    pub key_id: String,
    pub secret_key: String,
}

#[tauri::command]
pub async fn gex_save_api_key(args: SaveApiKeyArgs) -> Result<(), String> {
    let key_id = args.key_id.trim().to_string();
    let secret_key = args.secret_key.trim().to_string();
    if key_id.is_empty() || secret_key.is_empty() {
        return Err("Both Key ID and Secret are required".to_string());
    }
    let keys = AlpacaKeys { key_id, secret_key };
    tokio::task::spawn_blocking(move || api_key::save(&keys))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gex_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gex_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(api_key::delete)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

/// Parse "YYYY-MM-DD" → Unix seconds at midnight UTC. Returns 0 on
/// malformed input.
fn parse_expiration_to_unix(iso: &str) -> i64 {
    let parts: Vec<&str> = iso.split('-').collect();
    if parts.len() != 3 {
        return 0;
    }
    let y: i32 = parts[0].parse().unwrap_or(0);
    let m: u32 = parts[1].parse().unwrap_or(0);
    let d: u32 = parts[2].parse().unwrap_or(0);
    if y == 0 || m == 0 || d == 0 {
        return 0;
    }
    let yc = if m <= 2 { y - 1 } else { y };
    let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
    let yoe = (yc - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era as i64 * 146_097 + doe as i64 - 719_468;
    days * 86_400
}

fn unix_to_iso8601(unix_secs: i64) -> String {
    if unix_secs <= 0 {
        return String::new();
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
