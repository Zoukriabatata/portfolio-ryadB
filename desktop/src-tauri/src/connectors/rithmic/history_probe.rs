//! Diagnostic probe for `RequestTickBarReplay` (template 206).
//!
//! Purpose: validate whether a `bar_type=TickBar, bar_type_specifier="1"`
//! request returns ONE frame per trade or ONE frame per price-movement
//! (possibly with `num_trades > 1` aggregating same-price trades).
//!
//! Usage: invoked from the frontend via `rithmic_probe_tick_replay`
//! Tauri command; results are written to the Rust terminal as `tracing`
//! events. No engine pipeline is touched; the existing live + time-bar
//! history flows continue running.

use prost::Message as ProstMessage;
use tokio::time::{timeout, Duration};

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, request_tick_bar_replay::BarSubType,
    request_tick_bar_replay::BarType, request_tick_bar_replay::Direction,
    request_tick_bar_replay::TimeOrder, RequestLogin, RequestLogout, RequestTickBarReplay,
    ResponseLogin, ResponseTickBarReplay,
};

const REQUEST_LOGIN: i32 = 10;
const REQUEST_LOGOUT: i32 = 12;
const REQUEST_TICK_BAR_REPLAY: i32 = 206;
const RESPONSE_TICK_BAR_REPLAY: i32 = 207;
const PROTOCOL_TEMPLATE_VERSION: &str = "5.27";

/// Look-back window for the probe. 5 minutes of MNQ during RTH is
/// roughly 200-2000 trades — enough to see whether frames carry
/// `num_trades=1` (1 frame = 1 tick) or `num_trades>1` (1 frame =
/// 1 price movement aggregating multiple trades).
const PROBE_LOOKBACK_SECS: i64 = 5 * 60;

/// Result reported back to the caller — also dumped to `tracing::info!`
/// so the user sees it in the terminal even if the Tauri response is
/// dropped by an early-failing UI.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickReplayProbeResult {
    pub frames_seen: u32,
    pub bars_with_data: u32,
    pub rp_codes: Vec<String>,
    pub first_20: Vec<ProbeFrame>,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeFrame {
    pub index: u32,
    pub num_trades: u64,
    pub volume: u64,
    pub bid_volume: u64,
    pub ask_volume: u64,
    pub open_price: Option<f64>,
    pub close_price: Option<f64>,
    pub high_price: Option<f64>,
    pub low_price: Option<f64>,
    pub data_bar_ssboe: Vec<i32>,
    pub data_bar_usecs: Vec<i32>,
}

/// Probe the TickBarReplay endpoint on a fresh History Plant socket.
/// Hard timeout 30s. Returns ASAP after 20 frames have been logged
/// OR after the end-of-stream marker arrives, whichever comes first.
pub async fn probe_tick_bar_replay(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
) -> TickReplayProbeResult {
    let start = std::time::Instant::now();
    let outcome = timeout(
        Duration::from_secs(30),
        probe_inner(gateway_url, creds, symbol, exchange),
    )
    .await;
    let elapsed_ms = start.elapsed().as_millis() as u64;

    match outcome {
        Ok(Ok(mut r)) => {
            r.elapsed_ms = elapsed_ms;
            tracing::info!("[tick-probe] DONE: {:?}", r);
            r
        }
        Ok(Err(e)) => {
            let r = TickReplayProbeResult {
                frames_seen: 0,
                bars_with_data: 0,
                rp_codes: vec![],
                first_20: vec![],
                elapsed_ms,
                error: Some(format!("{}", e)),
            };
            tracing::warn!("[tick-probe] ERROR after {}ms: {:?}", elapsed_ms, r);
            r
        }
        Err(_) => {
            let r = TickReplayProbeResult {
                frames_seen: 0,
                bars_with_data: 0,
                rp_codes: vec![],
                first_20: vec![],
                elapsed_ms,
                error: Some("probe timed out (>30s)".into()),
            };
            tracing::warn!("[tick-probe] TIMEOUT after 30s");
            r
        }
    }
}

async fn probe_inner(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
) -> Result<TickReplayProbeResult> {
    let mut client = RithmicClient::new();
    tracing::info!("[tick-probe] connecting to {}", gateway_url);
    client.connect(gateway_url).await?;

    // ── Login HistoryPlant (same shape as history.rs:109) ──────────────
    let login_req = RequestLogin {
        template_id: REQUEST_LOGIN,
        template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
        user_msg: vec!["tick-probe".into()],
        user: Some(creds.username.clone()),
        password: Some(creds.password.clone()),
        app_name: Some(creds.app_name.clone()),
        app_version: Some(creds.app_version.clone()),
        system_name: Some(creds.system_name.clone()),
        infra_type: Some(SysInfraType::HistoryPlant as i32),
        mac_addr: vec![],
        os_version: None,
        os_platform: None,
        aggregated_quotes: None,
    };
    tracing::info!("[tick-probe] sending RequestLogin (HISTORY_PLANT)");
    client.send(&login_req).await?;
    let login_resp: ResponseLogin = client.recv().await?;
    if login_resp.template_id != 11 {
        let _ = client.close().await;
        return Err(ConnectorError::UnexpectedMessage(login_resp.template_id));
    }
    if !login_resp.rp_code.iter().any(|c| c == "0") {
        let _ = client.close().await;
        return Err(ConnectorError::AuthFailed(format!(
            "tick-probe login rejected: rp_code={:?} user_msg={:?}",
            login_resp.rp_code, login_resp.user_msg
        )));
    }
    tracing::info!("[tick-probe] login OK");

    // ── Request: 5 min of MNQ ticks, bar_type=TICK_BAR, specifier="1" ─
    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let start_index = now_sec - PROBE_LOOKBACK_SECS;
    let finish_index = now_sec;

    let replay_req = RequestTickBarReplay {
        template_id: REQUEST_TICK_BAR_REPLAY,
        user_msg: vec!["tick-probe".into()],
        symbol: Some(symbol.to_string()),
        exchange: Some(exchange.to_string()),
        bar_type: Some(BarType::TickBar as i32),
        bar_sub_type: Some(BarSubType::Regular as i32),
        bar_type_specifier: Some("1".into()),
        start_index: Some(start_index as i32),
        finish_index: Some(finish_index as i32),
        user_max_count: None,
        custom_session_open_ssm: None,
        custom_session_close_ssm: None,
        // Chronological order: oldest first. We're only reading 20 frames
        // for the diagnostic so direction barely matters, but Forwards
        // is the natural choice for a "5 minutes ago → now" window.
        direction: Some(Direction::First as i32),
        time_order: Some(TimeOrder::Forwards as i32),
        resume_bars: None,
    };
    tracing::info!(
        "[tick-probe] requesting tick replay for {}.{} window {}..{} ({}s)",
        symbol,
        exchange,
        start_index,
        finish_index,
        PROBE_LOOKBACK_SECS
    );
    client.send(&replay_req).await?;

    // ── Drain frames; log first 20 in detail, count the rest ──────────
    let mut frames_seen: u32 = 0;
    let mut bars_with_data: u32 = 0;
    let mut rp_codes: Vec<String> = Vec::new();
    let mut first_20: Vec<ProbeFrame> = Vec::new();

    loop {
        let raw = client.recv_raw().await?;
        let probe = TemplateProbe::decode(raw.as_slice())?;
        if probe.template_id != RESPONSE_TICK_BAR_REPLAY {
            tracing::info!(
                "[tick-probe] skipping unexpected template_id {} (expected {})",
                probe.template_id,
                RESPONSE_TICK_BAR_REPLAY
            );
            continue;
        }
        frames_seen += 1;
        let frame = ResponseTickBarReplay::decode(raw.as_slice())?;

        // Capture rp_codes whenever the server sets them.
        for c in frame.rp_code.iter() {
            if !rp_codes.contains(c) {
                rp_codes.push(c.clone());
            }
        }
        for c in frame.rq_handler_rp_code.iter() {
            let prefixed = format!("rqh:{}", c);
            if !rp_codes.contains(&prefixed) {
                rp_codes.push(prefixed);
            }
        }

        let has_bar =
            frame.open_price.is_some() && frame.close_price.is_some() && frame.volume.is_some();
        if has_bar {
            bars_with_data += 1;
        }

        if first_20.len() < 20 && has_bar {
            let pf = ProbeFrame {
                index: frames_seen,
                num_trades: frame.num_trades.unwrap_or(0),
                volume: frame.volume.unwrap_or(0),
                bid_volume: frame.bid_volume.unwrap_or(0),
                ask_volume: frame.ask_volume.unwrap_or(0),
                open_price: frame.open_price,
                close_price: frame.close_price,
                high_price: frame.high_price,
                low_price: frame.low_price,
                data_bar_ssboe: frame.data_bar_ssboe.clone(),
                data_bar_usecs: frame.data_bar_usecs.clone(),
            };
            tracing::info!(
                "[tick-probe] frame#{:03}  num_trades={}  vol={}  bid={}  ask={}  O={:?} H={:?} L={:?} C={:?}  ssboe={:?}",
                pf.index, pf.num_trades, pf.volume, pf.bid_volume, pf.ask_volume,
                pf.open_price, pf.high_price, pf.low_price, pf.close_price,
                pf.data_bar_ssboe,
            );
            first_20.push(pf);
        }

        // End-of-replay marker: rp_code populated AND no bar fields.
        let has_terminator = !frame.rp_code.is_empty() || !frame.rq_handler_rp_code.is_empty();
        if has_terminator && !has_bar {
            tracing::info!(
                "[tick-probe] end-of-stream: frames_seen={} bars_with_data={} rp_code={:?} rq_handler={:?}",
                frames_seen, bars_with_data, frame.rp_code, frame.rq_handler_rp_code
            );
            break;
        }
        // Safety cap: don't drain forever in case end-of-stream marker
        // never arrives (Apex hiccup) — bail after 1500 frames or once
        // we have what we need for the diagnostic.
        if frames_seen > 1500 {
            tracing::warn!(
                "[tick-probe] safety cap hit at {} frames — bailing out (diagnostic data is sufficient)",
                frames_seen
            );
            break;
        }
    }

    // ── Logout + close ─────────────────────────────────────────────────
    let logout = RequestLogout {
        template_id: REQUEST_LOGOUT,
        user_msg: vec![],
    };
    let _ = client.send(&logout).await;
    let _ = client.close().await;

    Ok(TickReplayProbeResult {
        frames_seen,
        bars_with_data,
        rp_codes,
        first_20,
        elapsed_ms: 0, // filled in by caller after timeout wrapper
        error: None,
    })
}
