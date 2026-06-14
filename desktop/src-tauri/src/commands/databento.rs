//! Tauri commands for the Databento connector.
//!
//! Three feature areas:
//!  - API key management (save / check / delete)
//!  - GEX snapshot via OPRA PILLAR (independent of Alpaca)
//!  - Option Flow trades via OPRA PILLAR (independent of Alpaca)

use tauri::State;

use crate::connectors::alpaca::{compute_gex, GexSnapshot};
use crate::connectors::alpaca::trades::OptionTrade;
use crate::connectors::databento::{api_key, fetch_option_chain, fetch_recent_trades, fetch_spot};
use crate::connectors::finnhub::TtlCache;
use std::time::Duration;

/// GEX snapshot cache — reused for Databento to avoid re-fetching definitions
/// every call (same TTL as OPRA Alpaca mode: 90 s).
pub struct DatabentoState {
    pub gex_cache: TtlCache<GexSnapshot>,
}

impl DatabentoState {
    pub fn new() -> Self {
        Self {
            gex_cache: TtlCache::new(Duration::from_secs(90)),
        }
    }
}

impl Default for DatabentoState {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Key management ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn databento_save_api_key(key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("API key cannot be empty".to_string());
    }
    tokio::task::spawn_blocking(move || api_key::save(&key))
        .await
        .map_err(|e| format!("task panic: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn databento_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| api_key::load())
        .await
        .map_err(|e| format!("task panic: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn databento_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(|| api_key::delete())
        .await
        .map_err(|e| format!("task panic: {e}"))?
        .map_err(|e| e.to_string())
}

// ─── GEX snapshot ────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabentoGexArgs {
    /// Underlying ticker as Databento expects it, e.g. "SPY" or "QQQ".
    pub symbol: String,
    /// Equity symbol for the spot price feed (ARCX: "SPY", "QQQ").
    /// Usually the same as `symbol`.
    pub spot_symbol: Option<String>,
}

#[tauri::command]
pub async fn databento_gex_fetch_snapshot(
    state: State<'_, DatabentoState>,
    args: DatabentoGexArgs,
) -> Result<GexSnapshot, String> {
    let cache_key = format!("db_gex|{}", args.symbol);
    if let Some(mut hit) = state.gex_cache.get(&cache_key).await {
        tracing::info!("databento_gex: cache hit {}", args.symbol);
        hit.stale = false;
        return Ok(hit);
    }

    let api_key = tokio::task::spawn_blocking(|| api_key::load())
        .await
        .map_err(|e| format!("task panic: {e}"))?
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Databento API key not configured — add it in Settings".to_string())?;

    let spot_sym = args.spot_symbol.as_deref().unwrap_or(&args.symbol);

    // Fetch spot and chains concurrently.
    let (spot_res, chains_res) = tokio::join!(
        fetch_spot(&api_key, spot_sym),
        // chains needs spot first — use a cheap pre-fetch with 0 to do definitions
        // then recompute; but to keep it simple we fetch spot first sequentially.
        async { Ok::<(), String>(()) }
    );

    let spot = spot_res.map_err(|e| format!("databento spot: {e}"))?;
    let _ = chains_res;

    if spot <= 0.0 {
        return Err(format!("databento: could not obtain spot price for {spot_sym}"));
    }

    let chains = fetch_option_chain(&api_key, &args.symbol, spot).await
        .map_err(|e| format!("databento chains: {e}"))?;

    if chains.is_empty() {
        return Err(format!(
            "databento: no option chain data available for {} (check subscription)",
            args.symbol
        ));
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let computed_at = {
        let s = now_secs;
        let h = (s % 86_400) / 3600;
        let m = (s % 3600) / 60;
        let sec = s % 60;
        format!("{:02}:{:02}:{:02}Z", h, m, sec)
    };

    let snapshot = compute_gex(&args.symbol, spot, &chains, computed_at, now_secs);
    state.gex_cache.set(cache_key, snapshot.clone()).await;

    Ok(snapshot)
}

// ─── Option Flow ─────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabentoFlowArgs {
    pub symbol: String,
    pub since_ms: Option<i64>,
}

#[tauri::command]
pub async fn databento_flow_poll(
    args: DatabentoFlowArgs,
) -> Result<Vec<OptionTrade>, String> {
    let api_key = tokio::task::spawn_blocking(|| api_key::load())
        .await
        .map_err(|e| format!("task panic: {e}"))?
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Databento API key not configured".to_string())?;

    fetch_recent_trades(&api_key, &args.symbol, args.since_ms).await
        .map_err(|e| format!("databento flow: {e}"))
}
