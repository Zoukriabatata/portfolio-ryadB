//! Rithmic + footprint IPC commands.
//!
//! Argument and return structs use `serde(rename_all = "camelCase")`
//! so the React side speaks idiomatic JS without a translation layer.

use std::time::Duration;

use prost::Message as ProstMessage;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::time::timeout;

use crate::brokers::vault;
use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::history::{self, BarSpec, HistoryBar};
use crate::connectors::rithmic::proto::{RequestRithmicSystemInfo, ResponseRithmicSystemInfo};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchHistoryArgs {
    pub symbol: String,
    pub exchange: String,
    /// Number of past hours to backfill. 24 = one day; 4H needs ~336;
    /// 1D needs ~4320 (6 months of futures contract life).
    pub hours_back: i64,
    /// Bar period in minutes. 1 = 1m bars. Used as a fallback when
    /// `timeframe` is not provided.
    pub bar_minutes: Option<i32>,
    /// Optional timeframe string ("1m", "4h", "1d", …) — when present,
    /// drives the bar_type dispatch (MinuteBar / DailyBar) and the
    /// returned `timeframe` label. Takes precedence over `bar_minutes`.
    pub timeframe: Option<String>,
    /// Instrument tick size (e.g. MNQ = 0.25, ES = 0.25, CL = 0.01).
    /// When present, the tick-history reconstruction snaps every trade
    /// price to this grid before bucketing into footprint levels,
    /// preventing sub-tick noise from Apex (or f64 round-trip) creating
    /// phantom levels. None falls back to the legacy 1e-6 bucket.
    pub tick_size: Option<f64>,
}

/// History bar shape returned to JS. camelCase via serde rename so the
/// React side can drop them straight into the FootprintBar map.
/// `levels` is always [] for history bars — TimeBarReplay aggregates
/// volume without per-price breakdown, so the renderer falls back to
/// outline-only candles for these bars (live bars after subscribe time
/// keep the full footprint cells).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFootprintBar {
    pub symbol: String,
    pub timeframe: String,
    pub bucket_ts_ns: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub total_volume: f64,
    pub total_delta: f64,
    pub trade_count: u32,
    pub levels: Vec<serde_json::Value>,
}

/// Returned by `rithmic_fetch_tick_history` so the frontend receives
/// rp_codes in the same synchronous response as the bars — avoids the
/// timing race where the `done` progress event arrives after the invoke
/// promise resolves, making rp_code=13 appear as "no rp_code received".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickHistoryResponse {
    pub bars: Vec<HistoryFootprintBar>,
    pub rp_codes: Vec<String>,
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
        gateway_url: args
            .gateway_url
            .unwrap_or_else(|| DEFAULT_GATEWAY_URL.into()),
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
    // Attempt #1 — fast path. Most subscribes succeed here.
    let first_err: String = {
        let mut adapter_lock = state.adapter.lock().await;
        match adapter_lock.as_mut() {
            None => "not logged in".to_string(),
            Some(adapter) => match adapter.subscribe(&args.symbol, &args.exchange).await {
                Ok(()) => return Ok(build_status(adapter)),
                Err(e) => format!("{e}"),
            },
        }
    }; // lock released here

    // Auto-reconnect ONLY triggers for transport-level errors that mean
    // the WebSocket is genuinely dead (`Sending after closing`, idle
    // timeout, server-side close). For any other error, returning early
    // is much safer than re-logging-in: Apex/Rithmic rejects concurrent
    // sessions on the same account ("permission denied" close frame),
    // so a spurious reconnect would kill a session that was actually
    // healthy.
    let is_transport_dead = first_err.contains("Sending after closing")
        || first_err.contains("Connection lost")
        || first_err.contains("Not connected")
        || first_err.contains("ConnectionClosed");
    if !is_transport_dead {
        return Err(format!("subscribe failed: {first_err}"));
    }

    tracing::warn!(
        "rithmic_subscribe: transport dead ({}). Auto-reconnecting from vault.",
        first_err
    );

    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("subscribe failed: {first_err}; vault task panicked: {e}"))?
        .map_err(|e| format!("subscribe failed: {first_err}; vault load failed: {e}"))?
        .ok_or_else(|| {
            format!("subscribe failed: {first_err}; no broker credentials saved for auto-reconnect")
        })?;

    let creds = Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url,
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    };

    // Tear down the dead adapter + engine task.
    let previous = {
        let mut adapter_lock = state.adapter.lock().await;
        adapter_lock.take()
    };
    if let Some(mut old) = previous {
        if let Err(e) = old.disconnect().await {
            tracing::warn!("auto-reconnect: previous disconnect failed: {e}");
        }
    }
    if let Some(handle) = state.engine_handle.lock().await.take() {
        handle.abort();
    }

    // Fresh socket + login.
    let mut adapter = RithmicAdapter::new();
    adapter
        .open_socket_with(&creds.gateway_url)
        .await
        .map_err(|e| format!("auto-reconnect connect failed: {e}"))?;
    adapter
        .login(&creds)
        .await
        .map_err(|e| format!("auto-reconnect login failed: {e}"))?;

    // Retry the subscribe on the fresh session.
    adapter
        .subscribe(&args.symbol, &args.exchange)
        .await
        .map_err(|e| format!("subscribe retry failed after reconnect: {e}"))?;

    // Re-attach the engine to the new adapter's tick stream.
    let engine_handle = state.engine.clone().spawn(adapter.ticks());
    let status = build_status(&adapter);
    *state.engine_handle.lock().await = Some(engine_handle);
    *state.adapter.lock().await = Some(adapter);

    Ok(status)
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
    let bars = state.engine.get_bars(&args.symbol, tf, args.n_bars).await;
    Ok(bars)
}

/// Fetch historical OHLC bars from the Rithmic HISTORY_PLANT. One-shot:
/// opens its own WebSocket, logs in with HISTORY_PLANT infra_type,
/// requests the bars, drains the replay, then logs out and closes —
/// all within a single command. The live ticker session is untouched.
///
/// Returns oldest → newest. Empty `levels` (TimeBarReplay aggregates;
/// see history.rs).
/// Fetch full footprint history (per-price bid/ask split) for the
/// requested window. Uses TickBarReplay under the hood and buckets
/// individual trades into footprint bars at the requested grain.
/// Unlike `rithmic_fetch_history` which returns OHLCV-only bars,
/// this returns bars with non-empty `levels` so the renderer can
/// draw real cells for historical bars.
#[tauri::command]
pub async fn rithmic_fetch_tick_history(
    app: tauri::AppHandle,
    args: FetchHistoryArgs,
) -> Result<TickHistoryResponse, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| "no broker credentials saved".to_string())?;

    let creds = Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url.clone(),
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    };

    // For tick history we still need a minute period for bucketing. We
    // derive it from `timeframe` when present (so "1h" maps to 60m
    // buckets) and fall back to `bar_minutes` for legacy callers. The
    // returned label uses the original timeframe string so frontend
    // filters (`bar.timeframe === currentTf`) match.
    let (bar_minutes, timeframe_label) = match parse_timeframe_arg(
        args.timeframe.as_deref(),
        args.bar_minutes,
    ) {
        (BarSpec::Minute(n), label) => (n, label),
        // Daily footprint: bucket all ticks in a 1440-minute (86400s)
        // window into one bar per UTC calendar day. This IS the daily
        // footprint use-case (ATAS-style), so we allow it intentionally.
        // Expect 30-90s load time for 10-15 days of ES/NQ data.
        (BarSpec::Daily, label) => (1440, label),
    };
    let symbol_full = format!("{}.{}", args.symbol, args.exchange);

    // ── Try VolumeProfileMinuteBars first (pre-aggregated footprint, lighter
    // entitlement than raw tick replay — works on Paper Trading systems that
    // return rp_code 13 for RequestTickBarReplay).
    // 30s timeout: if the server ignores template 501 it sends nothing back,
    // so recv_raw() would block indefinitely without this guard.
    let vp_bars = tokio::time::timeout(
        tokio::time::Duration::from_secs(30),
        crate::connectors::rithmic::history_ticks::fetch_volume_profile_bars(
            &stored.gateway_url,
            &creds,
            &args.symbol,
            &args.exchange,
            bar_minutes,
            args.hours_back,
            args.tick_size,
        ),
    )
    .await
    .unwrap_or_else(|_| {
        tracing::warn!(
            "rithmic_fetch_tick_history: VolumeProfile timed out (30s) for {} — falling back to tick replay",
            symbol_full
        );
        Ok(crate::connectors::rithmic::history_ticks::TickFetchResult { bars: vec![], rp_codes: vec![] })
    });

    let fetch_result = match vp_bars {
        Ok(r) if !r.bars.is_empty() => {
            tracing::info!(
                "rithmic_fetch_tick_history: VolumeProfile returned {} bars for {}",
                r.bars.len(), symbol_full
            );
            r
        }
        Ok(_) => {
            tracing::info!(
                "rithmic_fetch_tick_history: VolumeProfile returned 0 bars for {} — falling back to tick replay",
                symbol_full
            );
            crate::connectors::rithmic::history_ticks::fetch_tick_footprint_bars(
                &stored.gateway_url,
                &creds,
                &args.symbol,
                &args.exchange,
                bar_minutes,
                args.hours_back,
                args.tick_size,
                Some(app),
            )
            .await
            .map_err(|e| format!("fetch_tick_footprint_bars failed: {e}"))?
        }
        Err(e) => {
            tracing::warn!(
                "rithmic_fetch_tick_history: VolumeProfile error for {} ({}) — falling back to tick replay",
                symbol_full, e
            );
            crate::connectors::rithmic::history_ticks::fetch_tick_footprint_bars(
                &stored.gateway_url,
                &creds,
                &args.symbol,
                &args.exchange,
                bar_minutes,
                args.hours_back,
                args.tick_size,
                Some(app),
            )
            .await
            .map_err(|e| format!("fetch_tick_footprint_bars failed: {e}"))?
        }
    };
    let rp_codes = fetch_result.rp_codes;

    // Map → camelCase HistoryFootprintBar. Note that `levels` arrives
    // as a Vec<TickHistoryLevel> already serialised in camelCase by
    // serde, so we splat them in via serde_json::to_value to keep the
    // outer struct's `levels: Vec<serde_json::Value>` shape stable.
    let bars: Vec<HistoryFootprintBar> = fetch_result.bars
        .into_iter()
        .map(|b| HistoryFootprintBar {
            symbol: symbol_full.clone(),
            timeframe: timeframe_label.clone(),
            bucket_ts_ns: b.bucket_ts_ns,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            total_volume: b.total_volume,
            total_delta: b.total_delta,
            trade_count: b.trade_count,
            levels: b
                .levels
                .into_iter()
                .map(|l| serde_json::to_value(l).unwrap_or(serde_json::Value::Null))
                .collect(),
        })
        .collect();

    tracing::info!(
        "rithmic_fetch_tick_history: returned {} footprint bars for {} ({}h back, {}m grain)",
        bars.len(),
        symbol_full,
        args.hours_back,
        bar_minutes,
    );
    Ok(TickHistoryResponse { bars, rp_codes })
}

/// One-off diagnostic — fires a 5-minute `RequestTickBarReplay` on a
/// fresh HISTORY_PLANT socket and logs the first 20 frames. Used to
/// validate whether tick replay returns "1 frame = 1 trade" or
/// "1 frame = 1 price movement (num_trades >= 1)" before we commit to
/// a footprint history pipeline. The live + time-bar paths are not
/// affected.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeTickReplayArgs {
    pub symbol: String,
    pub exchange: String,
}

#[tauri::command]
pub async fn rithmic_probe_tick_replay(
    args: ProbeTickReplayArgs,
) -> Result<crate::connectors::rithmic::history_probe::TickReplayProbeResult, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| "no broker credentials saved".to_string())?;

    let creds = Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url.clone(),
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    };

    Ok(
        crate::connectors::rithmic::history_probe::probe_tick_bar_replay(
            &stored.gateway_url,
            &creds,
            &args.symbol,
            &args.exchange,
        )
        .await,
    )
}

#[tauri::command]
pub async fn rithmic_fetch_history(
    app: tauri::AppHandle,
    args: FetchHistoryArgs,
) -> Result<Vec<HistoryFootprintBar>, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| "no broker credentials saved".to_string())?;

    let creds = Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url.clone(),
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    };

    // Dispatch: timeframe string (e.g. "4h", "1d") takes precedence
    // over the legacy bar_minutes field. Falls back to MinuteBar with
    // bar_minutes when only the old shape is sent.
    let (spec, timeframe_label) = parse_timeframe_arg(args.timeframe.as_deref(), args.bar_minutes);

    let bars: Vec<HistoryBar> = history::fetch_history_bars(
        &stored.gateway_url,
        &creds,
        &args.symbol,
        &args.exchange,
        spec,
        args.hours_back,
        Some(app),
    )
    .await
    .map_err(|e| format!("fetch_history_bars failed: {e}"))?;

    let symbol_full = format!("{}.{}", args.symbol, args.exchange);
    let result: Vec<HistoryFootprintBar> = bars
        .into_iter()
        .map(|b| HistoryFootprintBar {
            symbol: symbol_full.clone(),
            timeframe: timeframe_label.clone(),
            bucket_ts_ns: (b.timestamp_sec.max(0) as u64) * 1_000_000_000,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            total_volume: b.total_volume as f64,
            total_delta: b.ask_volume as f64 - b.bid_volume as f64,
            trade_count: b.num_trades as u32,
            levels: vec![],
        })
        .collect();
    tracing::info!(
        "rithmic_fetch_history: returned {} bars for {} ({}h back, tf={})",
        result.len(),
        symbol_full,
        args.hours_back,
        timeframe_label,
    );
    Ok(result)
}

/// Map an incoming `(timeframe, bar_minutes)` pair from the frontend
/// to the corresponding `BarSpec` plus the label we'll echo back on
/// each bar. Recognized TF strings: "Nm", "Nh", "1d". Anything else
/// falls back to MinuteBar(bar_minutes) with the legacy "{N}m" label.
fn parse_timeframe_arg(timeframe: Option<&str>, bar_minutes: Option<i32>) -> (BarSpec, String) {
    if let Some(tf) = timeframe {
        if tf == "1d" {
            return (BarSpec::Daily, "1d".to_string());
        }
        if let Some(rest) = tf.strip_suffix('h') {
            if let Ok(n) = rest.parse::<i32>() {
                return (BarSpec::Minute((n.max(1)) * 60), tf.to_string());
            }
        }
        if let Some(rest) = tf.strip_suffix('m') {
            if let Ok(n) = rest.parse::<i32>() {
                return (BarSpec::Minute(n.max(1)), tf.to_string());
            }
        }
    }
    let n = bar_minutes.unwrap_or(1).max(1);
    (BarSpec::Minute(n), format!("{}m", n))
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
    Ok(adapter_lock.as_ref().map(build_status).unwrap_or_default())
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

/// Interroge la gateway `gateway_url` (pre-login) et retourne la liste
/// de tous les system_names disponibles sur cette gateway.
/// Utile pour diagnostiquer quel system_name utiliser (ex: AMP Futures).
#[tauri::command]
pub async fn rithmic_list_systems(gateway_url: Option<String>) -> Result<Vec<String>, String> {
    let url = gateway_url
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "wss://rprotocol.rithmic.com:443".to_string());

    let result = timeout(Duration::from_secs(8), async {
        let mut client = RithmicClient::new();
        client.connect(&url).await.map_err(|e| format!("connect failed: {e}"))?;

        let req = RequestRithmicSystemInfo {
            template_id: 16,
            user_msg: vec![],
        };
        client.send(&req).await.map_err(|e| format!("send failed: {e}"))?;

        let raw = client.recv_raw().await.map_err(|e| format!("recv failed: {e}"))?;
        let _ = client.close().await;

        let probe = TemplateProbe::decode(raw.as_slice())
            .map_err(|e| format!("probe decode: {e}"))?;

        tracing::info!("rithmic_list_systems: response template_id={}", probe.template_id);

        let resp = ResponseRithmicSystemInfo::decode(raw.as_slice())
            .map_err(|e| format!("response decode: {e}"))?;

        if !resp.rp_code.iter().any(|c| c == "0") {
            return Err(format!("rp_code={:?}", resp.rp_code));
        }

        Ok(resp.system_name)
    })
    .await
    .map_err(|_| "timeout (>8s)".to_string())?;

    result
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
        "1d" => Ok(Timeframe::Day1),
        "100t" => Ok(Timeframe::Ticks100),
        other => Err(format!("unknown timeframe: {other}")),
    }
}
