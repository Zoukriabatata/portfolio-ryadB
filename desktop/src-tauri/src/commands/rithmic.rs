//! Rithmic + footprint IPC commands.
//!
//! Argument and return structs use `serde(rename_all = "camelCase")`
//! so the React side speaks idiomatic JS without a translation layer.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::brokers::vault;
use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::rithmic::RithmicAdapter;
use crate::engine::{FootprintBar, Timeframe};
use crate::state::RithmicState;

const DEFAULT_GATEWAY_URL: &str = "wss://rituz00100.rithmic.com:443";
const DEFAULT_APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginArgs {
    pub username: String,
    pub password: String,
    pub system_name: String,
    pub gateway_url: Option<String>,
    pub app_name: Option<String>,
    pub app_version: Option<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RithmicStatus {
    pub connected: bool,
    pub logged_in: bool,
    pub user: Option<String>,
    pub system_name: Option<String>,
    pub fcm: Option<String>,
    pub ib: Option<String>,
    pub country: Option<String>,
    pub heartbeat_secs: Option<f64>,
    /// Each subscription as "SYMBOL.EXCHANGE" (matches Tick.symbol).
    pub subscriptions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeArgs {
    pub symbol: String,
    pub exchange: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBarsArgs {
    /// Full symbol, e.g. "MNQM6.CME".
    pub symbol: String,
    /// Short label as exposed by `Timeframe::as_str()` ("5s", "1m"…).
    pub timeframe: String,
    pub n_bars: usize,
}

/// Connect to the Rithmic gateway and authenticate. On success,
/// spawns the `FootprintEngine` task pumping ticks from the new
/// adapter, replacing any previous session cleanly.
#[tauri::command]
pub async fn rithmic_login(
    state: State<'_, RithmicState>,
    args: LoginArgs,
) -> Result<RithmicStatus, String> {
    let creds = Credentials {
        username: args.username,
        password: args.password,
        system_name: args.system_name,
        gateway_url: args.gateway_url.unwrap_or_else(|| DEFAULT_GATEWAY_URL.into()),
        app_name: args.app_name.unwrap_or_else(|| DEFAULT_APP_NAME.into()),
        app_version: args.app_version.unwrap_or_else(|| APP_VERSION.into()),
    };

    // Tear down any previous session so we don't leak the old reader/
    // heartbeat tasks. Doing this with the lock held would deadlock
    // because disconnect() also takes async time on the socket — so
    // we move the old adapter out, drop the guard, then call
    // disconnect on the standalone value.
    let previous = {
        let mut adapter_lock = state.adapter.lock().await;
        adapter_lock.take()
    };
    if let Some(mut old) = previous {
        if let Err(e) = old.disconnect().await {
            tracing::warn!("rithmic_login: previous session disconnect failed: {e}");
        }
    }
    if let Some(handle) = state.engine_handle.lock().await.take() {
        handle.abort();
    }

    let mut adapter = RithmicAdapter::new();
    // Phase 7.9 follow-up: open the socket against the user's chosen
    // gateway, not the hardcoded UAT default. The vault flow plumbs
    // creds.gateway_url through here, so prod accounts (Apex etc.)
    // land on the right host instead of rituz00100 (UAT) which would
    // reject "Apex"/"Rithmic 01"/etc with rp_code=1067.
    adapter
        .open_socket_with(&creds.gateway_url)
        .await
        .map_err(|e| format!("connect failed: {e}"))?;
    adapter
        .login(&creds)
        .await
        .map_err(|e| format!("login failed: {e}"))?;

    // Pump ticks into the shared engine.
    let engine = state.engine.clone();
    let tick_rx = adapter.ticks();
    let engine_handle = engine.spawn(tick_rx);

    let status = build_status(&adapter);

    *state.engine_handle.lock().await = Some(engine_handle);
    *state.adapter.lock().await = Some(adapter);

    Ok(status)
}

/// Connect using the credentials persisted in the OS-native vault.
/// This is the production path: the React app saves credentials once
/// via `saveBrokerCredentials`, and from then on it only ever calls
/// `rithmicLoginFromVault` — the plaintext password never crosses
/// the IPC boundary again.
///
/// Returns the same `RithmicStatus` as `rithmic_login(args)` so the
/// frontend can render either path identically.
#[tauri::command]
pub async fn rithmic_login_from_vault(
    state: State<'_, RithmicState>,
) -> Result<RithmicStatus, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?;
    let stored = stored.ok_or_else(|| "no broker credentials saved".to_string())?;

    let args = LoginArgs {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: Some(stored.gateway_url),
        app_name: None,
        app_version: None,
    };
    rithmic_login(state, args).await
}

#[tauri::command]
pub async fn rithmic_subscribe(
    state: State<'_, RithmicState>,
    args: SubscribeArgs,
) -> Result<RithmicStatus, String> {
    let mut adapter_lock = state.adapter.lock().await;
    let adapter = adapter_lock.as_mut().ok_or("not logged in")?;

    adapter
        .subscribe(&args.symbol, &args.exchange)
        .await
        .map_err(|e| format!("subscribe failed: {e}"))?;

    Ok(build_status(adapter))
}

#[tauri::command]
pub async fn rithmic_unsubscribe(
    state: State<'_, RithmicState>,
    args: SubscribeArgs,
) -> Result<RithmicStatus, String> {
    let mut adapter_lock = state.adapter.lock().await;
    let adapter = adapter_lock.as_mut().ok_or("not logged in")?;

    adapter
        .unsubscribe(&args.symbol, &args.exchange)
        .await
        .map_err(|e| format!("unsubscribe failed: {e}"))?;

    Ok(build_status(adapter))
}

/// Snapshot the last `n_bars` for `(symbol, timeframe)`. Used by the
/// React UI on first paint to render historical context before
/// switching to the live `footprint-update` event stream.
#[tauri::command]
pub async fn rithmic_get_bars(
    state: State<'_, RithmicState>,
    args: GetBarsArgs,
) -> Result<Vec<FootprintBar>, String> {
    let tf = parse_timeframe(&args.timeframe)?;
    Ok(state.engine.get_bars(&args.symbol, tf, args.n_bars).await)
}

#[tauri::command]
pub async fn rithmic_disconnect(state: State<'_, RithmicState>) -> Result<(), String> {
    let previous = {
        let mut adapter_lock = state.adapter.lock().await;
        adapter_lock.take()
    };
    if let Some(mut adapter) = previous {
        adapter
            .disconnect()
            .await
            .map_err(|e| format!("disconnect failed: {e}"))?;
    }

    if let Some(handle) = state.engine_handle.lock().await.take() {
        handle.abort();
    }

    Ok(())
}

#[tauri::command]
pub async fn rithmic_status(state: State<'_, RithmicState>) -> Result<RithmicStatus, String> {
    let adapter_lock = state.adapter.lock().await;
    Ok(adapter_lock
        .as_ref()
        .map(build_status)
        .unwrap_or_default())
}

fn build_status(adapter: &RithmicAdapter) -> RithmicStatus {
    let session = adapter.session();
    let subscriptions = adapter
        .subscriptions()
        .iter()
        .map(|(sym, ex)| format!("{}.{}", sym, ex))
        .collect();

    RithmicStatus {
        connected: true,
        logged_in: session.is_some(),
        user: session.map(|s| s.user.clone()),
        system_name: session.map(|s| s.system_name.clone()),
        fcm: session.map(|s| s.fcm_id.clone()),
        ib: session.map(|s| s.ib_id.clone()),
        country: session.map(|s| s.country_code.clone()),
        heartbeat_secs: session.map(|s| s.heartbeat_interval_secs),
        subscriptions,
    }
}

fn parse_timeframe(s: &str) -> Result<Timeframe, String> {
    match s {
        "1s" => Ok(Timeframe::Sec1),
        "5s" => Ok(Timeframe::Sec5),
        "15s" => Ok(Timeframe::Sec15),
        "30s" => Ok(Timeframe::Sec30),
        "1m" => Ok(Timeframe::Min1),
        "3m" => Ok(Timeframe::Min3),
        "5m" => Ok(Timeframe::Min5),
        "15m" => Ok(Timeframe::Min15),
        "30m" => Ok(Timeframe::Min30),
        "1h" => Ok(Timeframe::Hour1),
        other => Err(format!("unknown timeframe: {other}")),
    }
}
