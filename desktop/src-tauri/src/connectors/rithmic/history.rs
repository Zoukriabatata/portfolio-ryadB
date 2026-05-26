//! Rithmic History plant client — one-shot historical bar fetch.
//!
//! The live market data path uses TICKER_PLANT (adapter.rs). Historical
//! bars are served from a different "plant" — HISTORY_PLANT — which is
//! reached by sending a RequestLogin with `infra_type = HISTORY_PLANT`
//! to the same gateway URL. Once authenticated, a single
//! RequestTimeBarReplay (template 206) yields a stream of
//! ResponseTimeBarReplay frames (template 207), one per bar, terminated
//! by a "metadata-only" frame carrying a non-empty `rp_code`.
//!
//! This module is intentionally a self-contained one-shot client (open
//! → login → request → drain → logout → close) instead of being grafted
//! onto RithmicAdapter, because:
//!   - history fetches don't need heartbeats / persistent reader tasks
//!   - HISTORY_PLANT and TICKER_PLANT can't share a single login
//!   - Apex/Rithmic enforces a strict concurrent-session limit per
//!     account, so the history socket must be torn down cleanly before
//!     the live socket reconnects (or vice-versa).

use prost::Message as ProstMessage;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::time::{timeout, Duration};

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, request_time_bar_replay::BarSubType,
    request_time_bar_replay::BarType, request_time_bar_replay::TimeOrder, RequestLogin,
    RequestLogout, RequestTimeBarReplay, ResponseLogin, ResponseTimeBarReplay,
};

/// Final progress event emitted when the time-bar replay finishes.
/// Same channel as the tick-replay fetch — React routes both through
/// one listener and just inspects `barMinutes` to know which path
/// fired. The `rp_codes` / `rq_handler_rp_codes` / `user_msgs` carry
/// Apex's status strings so a 0-bar fetch can be diagnosed without
/// `RUST_LOG=info` on the desktop binary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryProgressEvent<'a> {
    symbol: &'a str,
    exchange: &'a str,
    bar_minutes: i32,
    chunks_processed: u32,
    max_chunks: u32,
    bars_bucketed: usize,
    total_ticks_kept: u32,
    latest_tick_sec: i64,
    finish_index: i64,
    done: bool,
    rp_codes: Vec<String>,
    rq_handler_rp_codes: Vec<String>,
    user_msgs: Vec<String>,
}

// Template IDs verified against the Rithmic R|Protocol Reference Guide
// (`rithmic-sdk/doc/Reference_Guide.pdf`, "Templates" table, p.425-432):
//
//   200  Time Bar Update Request          (live subscribe — not used here)
//   201  Time Bar Update Response
//   202  Time Bar Replay Request    ← what we send (minute / daily bars)
//   203  Time Bar Replay Response   ← what we drain
//   206  Tick Bar Replay Request          (tick / range / volume bars)
//   207  Tick Bar Replay Response
//
// The SDK Python sample (`SampleBar.py`) only ships a TickBarReplay
// example (template 206) — there is no TimeBarReplay sample anywhere in
// rithmic-sdk/samples, which is how earlier iterations of this file
// drifted onto template 206. Sending a TimeBarReplay payload on the
// TickBarReplay channel made Apex's gateway validate the message as
// a TickBarReplay request, see incompatible bar_type / no specifier,
// and stream 0 bars after a ~13s drain → the bug we just hunted down.
const REQUEST_LOGIN: i32 = 10;
const REQUEST_LOGOUT: i32 = 12;
const REQUEST_TIME_BAR_REPLAY: i32 = 202;
const RESPONSE_TIME_BAR_REPLAY: i32 = 203;

const PROTOCOL_TEMPLATE_VERSION: &str = "5.27";

/// One historical OHLCV bar from the Rithmic history plant.
/// Per-price-level footprint detail is unavailable here (would require
/// TickBarReplay instead — much heavier). The frontend renders these
/// bars with the candle outline only; live bars after subscribe time
/// keep the full footprint cells.
#[derive(Debug, Clone)]
pub struct HistoryBar {
    /// Bar bucket start, Unix seconds.
    pub timestamp_sec: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub total_volume: u64,
    pub bid_volume: u64,
    pub ask_volume: u64,
    pub num_trades: u64,
}

/// Which Rithmic bar type the caller wants. Maps directly to the
/// `BarType` enum in the TimeBarReplay proto (MinuteBar=2, DailyBar=3).
/// We support Minute(N) for any N≥1 (1m, 4h via 240m, etc.) and Daily
/// for 1D snapshots — Weekly/Monthly/Yearly aren't wired yet (Apex
/// supports WEEKLY_BAR but the use case is rare; MONTHLY/YEARLY would
/// need client-side aggregation).
#[derive(Debug, Clone, Copy)]
pub enum BarSpec {
    Minute(i32),
    Daily,
}

impl BarSpec {
    fn bar_type(self) -> BarType {
        match self {
            BarSpec::Minute(_) => BarType::MinuteBar,
            BarSpec::Daily => BarType::DailyBar,
        }
    }
    fn period(self) -> i32 {
        match self {
            BarSpec::Minute(n) => n.max(1),
            BarSpec::Daily => 1,
        }
    }
    fn specifier(self) -> String {
        // Apex requires this field to be present and non-empty. For
        // MinuteBar it mirrors the period; for DailyBar "1" works in
        // practice (= 1 day per bar).
        self.period().to_string()
    }
    fn user_msg(self) -> String {
        match self {
            BarSpec::Minute(n) => format!("{}m_history", n),
            BarSpec::Daily => "1d_history".to_string(),
        }
    }
}

/// Fetch `hours_back` of OHLCV bars for `symbol.exchange` from the
/// Rithmic history plant. `spec` controls grain (minute period or
/// daily). Returns oldest → newest. Caller does any per-bar post-
/// processing (delta = ask − bid, label formatting, etc).
///
/// Hard timeout scales with the window: minute-grain stays at 30s
/// (one day of 1m fits comfortably), daily stretches to 60s because
/// 6 months of daily bars can spike Apex round-trips under load.
pub async fn fetch_history_bars(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
    spec: BarSpec,
    hours_back: i64,
    app: Option<AppHandle>,
) -> Result<Vec<HistoryBar>> {
    let secs = match spec {
        BarSpec::Daily => 60,
        BarSpec::Minute(_) => 30,
    };
    timeout(
        Duration::from_secs(secs),
        fetch_history_bars_inner(gateway_url, creds, symbol, exchange, spec, hours_back, app),
    )
    .await
    .map_err(|_| ConnectorError::Other(format!("history fetch timed out (>{}s)", secs)))?
}

async fn fetch_history_bars_inner(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
    spec: BarSpec,
    hours_back: i64,
    app: Option<AppHandle>,
) -> Result<Vec<HistoryBar>> {
    let mut client = RithmicClient::new();
    tracing::info!("history: connecting to {}", gateway_url);
    client.connect(gateway_url).await?;

    // CRITICAL: do NOT send RequestRithmicSystemInfo here. The Rithmic
    // gateway closes the WebSocket immediately after responding to
    // system_info — confirmed in the official Python SampleBar.py:
    //   "After this request is processed by the server, the server
    //    will initiate the closing of the websocket connection."
    // Doing system_info+login on the same socket leaves the login send
    // going into a closed pipe and the recv() blocking forever (the
    // exact symptom we observed: "history: sending RequestLogin"
    // followed by silence). Login goes directly after connect.

    // Step 1 — login with HISTORY_PLANT infra_type. Identical fields
    // to the ticker plant otherwise; mismatched field sets cause the
    // gateway to silently close the socket.
    let login_req = RequestLogin {
        template_id: REQUEST_LOGIN,
        template_version: Some(PROTOCOL_TEMPLATE_VERSION.to_string()),
        user_msg: vec!["history".to_string()],
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
    tracing::info!(
        "history: sending RequestLogin (HISTORY_PLANT) for system '{}'",
        creds.system_name
    );
    client.send(&login_req).await?;
    let login_resp: ResponseLogin = client.recv().await?;
    if login_resp.template_id != 11 {
        client.close().await.ok();
        return Err(ConnectorError::UnexpectedMessage(login_resp.template_id));
    }
    if !login_resp.rp_code.iter().any(|c| c == "0") {
        client.close().await.ok();
        return Err(ConnectorError::AuthFailed(format!(
            "history login rejected: rp_code={:?} user_msg={:?}",
            login_resp.rp_code, login_resp.user_msg
        )));
    }
    tracing::info!("history: login OK");

    // Step 2 — request the bar replay window.
    //
    // CRITICAL — Rithmic semantics (verified empirically against Apex):
    //   * `Direction::First` + `TimeOrder::Forwards` makes the server
    //     stream from the OLDEST available bar in the archive, ignoring
    //     `start_index` as a hard lower bound. With Apex's archive cap
    //     of ~10 000 bars, this returns the start-of-archive (timestamps
    //     near epoch 0 → "newest=1970-01-01" symptom in the UI).
    //   * `Direction::Last` + `TimeOrder::Backwards` is the documented
    //     pattern for "give me the N most-recent bars": server walks
    //     from the END of the available data toward the past.
    //
    // Window now honors `hours_back` — the previous 36h cap was a
    // legacy from the day this fn only served 1H footprint history.
    // For 4H/1D we need weeks/months of lookback. We still floor at
    // 36h so callers passing 0 by accident don't get a degenerate
    // window that truncates the active Globex session.
    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let effective_hours = hours_back.max(36);
    let start_index = now_sec - effective_hours * 3600;
    let finish_index = now_sec;

    // Canonical async_rithmic shape — leave `direction` unset and
    // use `time_order=Forwards`. Matches the pattern in
    // https://github.com/rundef/async_rithmic/blob/main/async_rithmic/plants/history.py
    // which is the de-facto reference for working Rithmic replay calls.
    // `user_msg = symbol` mirrors that library.
    let replay_req = RequestTimeBarReplay {
        template_id: REQUEST_TIME_BAR_REPLAY,
        user_msg: vec![symbol.to_string()],
        symbol: Some(symbol.to_string()),
        exchange: Some(exchange.to_string()),
        bar_type: Some(spec.bar_type() as i32),
        // Apex requires bar_sub_type — rp_code=1009 when missing.
        bar_sub_type: Some(BarSubType::Regular as i32),
        bar_type_period: Some(spec.period()),
        // Apex requires bar_type_specifier — rp_code=1015 when missing.
        bar_type_specifier: Some(spec.specifier()),
        start_index: Some(start_index as i32),
        finish_index: Some(finish_index as i32),
        user_max_count: None,
        direction: None,
        time_order: Some(TimeOrder::Forwards as i32),
        resume_bars: None,
    };
    tracing::info!(
        "history: requesting {:?} bars for {}.{}, window {}..{} ({}h, Forwards, direction unset)",
        spec,
        symbol,
        exchange,
        start_index,
        finish_index,
        effective_hours,
    );
    client.send(&replay_req).await?;

    // Step 3 — drain ResponseTimeBarReplay frames until we see the
    // "end of replay" marker. End is signalled by a frame with a
    // non-empty `rp_code` AND no bar fields populated.
    let mut bars: Vec<HistoryBar> = Vec::new();
    let mut frames_seen: u32 = 0;
    // Status strings captured from the terminator. Forwarded to React
    // via the final `rithmic-history-progress` event so a 0-bar
    // response surfaces Apex's "why" instead of disappearing.
    let mut rp_codes: Vec<String> = Vec::new();
    let mut rq_handler_rp_codes: Vec<String> = Vec::new();
    let mut user_msgs: Vec<String> = Vec::new();
    loop {
        let raw = client.recv_raw().await?;
        let probe = TemplateProbe::decode(raw.as_slice())?;
        if probe.template_id != RESPONSE_TIME_BAR_REPLAY {
            // Skip anything we didn't ask for (heartbeats from server
            // side, stray template 19, etc). Log it so a wrong
            // template_id constant shows up as "skipped X" rather than
            // a silent timeout.
            tracing::info!(
                "history: skipping unexpected template_id {} (expected {})",
                probe.template_id,
                RESPONSE_TIME_BAR_REPLAY
            );
            continue;
        }
        frames_seen += 1;
        let frame = ResponseTimeBarReplay::decode(raw.as_slice())?;

        // Surface Apex's error codes immediately. rp_code is set on the
        // FINAL frame (end-of-stream marker) but may also appear on
        // intermediate frames when the server rejects the request —
        // e.g. permissioning ("user not permissioned for replay") or
        // plant unavailability. Without this log, those errors are
        // hidden inside the "0 bars returned" silence.
        if !frame.rp_code.is_empty() || !frame.rq_handler_rp_code.is_empty() {
            tracing::info!(
                "history frame#{}: rp_code={:?} rq_handler_rp_code={:?} user_msg={:?} request_key={:?}",
                frames_seen,
                frame.rp_code,
                frame.rq_handler_rp_code,
                frame.user_msg,
                frame.request_key,
            );
        }

        let has_bar = frame.open_price.is_some()
            && frame.high_price.is_some()
            && frame.low_price.is_some()
            && frame.close_price.is_some();

        // Sentinel filter — Apex occasionally interleaves a marker=0
        // frame that also carries OHLC fields (likely an end-of-stream
        // hint or padding from the gateway). Without this guard the
        // bar gets timestamp 1970-01-01, drags the chart's time axis
        // back to epoch 0, and confuses every "today" filter.
        let marker = frame.marker.unwrap_or(0) as i64;
        if has_bar && marker > 0 {
            bars.push(HistoryBar {
                timestamp_sec: marker,
                open: frame.open_price.unwrap_or(0.0),
                high: frame.high_price.unwrap_or(0.0),
                low: frame.low_price.unwrap_or(0.0),
                close: frame.close_price.unwrap_or(0.0),
                total_volume: frame.volume.unwrap_or(0),
                bid_volume: frame.bid_volume.unwrap_or(0),
                ask_volume: frame.ask_volume.unwrap_or(0),
                num_trades: frame.num_trades.unwrap_or(0),
            });
        } else if has_bar && marker <= 0 {
            tracing::debug!("history: skipped sentinel bar with marker={}", marker);
        }

        // End-of-replay: a metadata-only frame with rp_code populated.
        // Some Rithmic environments also send rq_handler_rp_code;
        // either signals "we're done streaming bars".
        let has_terminator = !frame.rp_code.is_empty() || !frame.rq_handler_rp_code.is_empty();
        if has_terminator && !has_bar {
            // Capture status strings before bailing so the caller can
            // forward them to React.
            for c in frame.rp_code.iter() {
                if !rp_codes.contains(c) {
                    rp_codes.push(c.clone());
                }
            }
            for c in frame.rq_handler_rp_code.iter() {
                if !rq_handler_rp_codes.contains(c) {
                    rq_handler_rp_codes.push(c.clone());
                }
            }
            for m in frame.user_msg.iter() {
                if !user_msgs.contains(m) {
                    user_msgs.push(m.clone());
                }
            }
            tracing::info!(
                "history: replay complete, {} bars, rp_code={:?} rq_handler={:?} user_msg={:?}",
                bars.len(),
                frame.rp_code,
                frame.rq_handler_rp_code,
                frame.user_msg,
            );
            break;
        }
    }

    // Step 4 — clean shutdown so Apex's session-limit doesn't hold
    // the slot for our other (live) connection.
    let logout = RequestLogout {
        template_id: REQUEST_LOGOUT,
        user_msg: vec![],
    };
    let _ = client.send(&logout).await;
    client.close().await.ok();

    tracing::info!(
        "history: APEX STATUS — rp_codes={:?} rq_handler_rp_codes={:?} user_msgs={:?}",
        rp_codes,
        rq_handler_rp_codes,
        user_msgs,
    );

    // Emit a final progress event so React can read Apex's status
    // strings even on the time-bar path (the tick-replay path emits
    // per-chunk; here we emit once at the end since there's no
    // chunking).
    if let Some(handle) = app.as_ref() {
        let bar_minutes_for_event = match spec {
            BarSpec::Minute(n) => n,
            BarSpec::Daily => 1440,
        };
        let _ = handle.emit(
            "rithmic-history-progress",
            HistoryProgressEvent {
                symbol,
                exchange,
                bar_minutes: bar_minutes_for_event,
                chunks_processed: 1,
                max_chunks: 1,
                bars_bucketed: bars.len(),
                total_ticks_kept: frames_seen,
                latest_tick_sec: 0,
                finish_index,
                done: true,
                rp_codes,
                rq_handler_rp_codes,
                user_msgs,
            },
        );
    }

    Ok(bars)
}
