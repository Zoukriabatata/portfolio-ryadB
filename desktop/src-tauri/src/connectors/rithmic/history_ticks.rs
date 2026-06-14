//! Rithmic History plant — TICK replay + footprint reconstruction.
//!
//! Companion to `history.rs` (which does TimeBarReplay → OHLCV only).
//! This module fetches *individual trades* via `RequestTickBarReplay`
//! (template 206) with `bar_type=TICK_BAR, bar_type_specifier="1"`
//! so each response frame ≈ one trade, then buckets the ticks into
//! footprint bars at the requested timeframe so the front-end can
//! render historical bars with real bid/ask cells instead of empty
//! OHLC outlines.
//!
//! Why a separate file:
//!   • TimeBarReplay (202/203) and TickBarReplay (206/207) have
//!     different proto types — keeping them apart avoids a giant
//!     match on `bar_type` in one fetch fn.
//!   • The bucketing/footprint reconstruction is tick-specific and
//!     doesn't share any code with the time-bar path.
//!
//! Apex's HISTORY_PLANT empirically caps each replay at ~10 000
//! frames. For a 1-day MNQ session that's ~5-10 % of total ticks
//! during RTH. v1 ships single-chunk only — chunking (re-request with
//! `start_index = last_tick_ts + 1`) is a future iteration.

use std::collections::BTreeMap;

use prost::Message as ProstMessage;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::time::{timeout, Duration};

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::gateway_discovery;
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, request_tick_bar_replay::BarSubType,
    request_tick_bar_replay::BarType, request_tick_bar_replay::TimeOrder, RequestLogin,
    RequestLogout, RequestTickBarReplay, RequestVolumeProfileMinuteBars, ResponseLogin,
    ResponseTickBarReplay, ResponseVolumeProfileMinuteBars,
};

const REQUEST_LOGIN: i32 = 10;
const REQUEST_LOGOUT: i32 = 12;
const REQUEST_TICK_BAR_REPLAY: i32 = 206;
const RESPONSE_TICK_BAR_REPLAY: i32 = 207;
// VolumeProfileMinuteBars — template IDs from the async_rithmic convention (v5.19+).
// If the server returns an unexpected template_id, write_history_debug will log it.
const REQUEST_VOLUME_PROFILE: i32 = 501;
const RESPONSE_VOLUME_PROFILE: i32 = 502;
const PROTOCOL_TEMPLATE_VERSION: &str = "5.27";

/// Hard outer timeout for the whole multi-chunk walk. Tick replay
/// over an active 24h MNQ window can take 60-90 chunks (Apex caps
/// each at ~10 000 frames) × ~5-8s per chunk + 250 ms sleep gates,
/// so worst-case sits around 8-10 minutes. We allow 12 to leave
/// headroom for a momentarily slow gateway without hanging the UI
/// indefinitely.
const REPLAY_TIMEOUT: Duration = Duration::from_secs(20 * 60);

/// TEMP DIAGNOSTIC — history root cause on "Rithmic Paper Trading"
/// (4PropTrader). Mirrors `gateway_discovery::write_debug_log`: appends
/// the HISTORY_PLANT login result + replay terminator status to a file
/// on the Desktop so the *primary* attempt's rp_code is visible without
/// a terminal (the packaged app drops tracing output). Remove once the
/// 4PropTrader history entitlement question is settled.
fn write_history_debug(content: &str) {
    use std::io::Write as _;
    let path = r"C:\Users\ryadb\Desktop\history_debug.log";
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = f.write_all(content.as_bytes());
        let _ = f.write_all(b"\n");
    }
}

/// One reconstructed footprint bar, ready to be shipped to the
/// renderer. Same JSON shape as `HistoryFootprintBar` in commands.rs
/// — the command layer maps 1:1 without copying.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickHistoryBar {
    pub bucket_ts_ns: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub total_volume: f64,
    pub total_delta: f64,
    pub trade_count: u32,
    pub levels: Vec<TickHistoryLevel>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickHistoryLevel {
    pub price: f64,
    pub buy_volume: f64,
    pub sell_volume: f64,
    pub buy_trades: u32,
    pub sell_trades: u32,
}

/// Fetch up to `hours_back` of tick data and reconstruct footprint
/// bars at the requested `bar_minutes` grain. Each "tick" we receive
/// from Rithmic carries `bid_volume` xor `ask_volume` (the aggressor
/// is implicit in which side is populated). One frame → one trade in
/// the common case; if `num_trades > 1` it represents multiple
/// same-price aggregated trades at the same instant — we account for
/// that by treating `volume` as the trade size and `num_trades` as
/// the trade count for the price level.
pub async fn fetch_tick_footprint_bars(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
    bar_minutes: i32,
    hours_back: i64,
    tick_size: Option<f64>,
    app: Option<AppHandle>,
) -> Result<TickFetchResult> {
    // Primary path: HistoryPlant (Apex, 4PropTrader, accounts with
    // tick-history subscription). Pass app=None — progress events
    // fire only on the path that actually returns data.
    let primary = timeout(
        REPLAY_TIMEOUT,
        fetch_inner(
            gateway_url, creds, symbol, exchange, bar_minutes, hours_back,
            tick_size, SysInfraType::HistoryPlant, None,
        ),
    )
    .await
    .map_err(|_| ConnectorError::Other("tick history fetch timed out (>60s)".into()));

    match primary {
        Ok(Ok(result)) if !result.bars.is_empty() => return Ok(result),
        Ok(Ok(_)) => {
            tracing::info!(
                "history-ticks: HistoryPlant returned 0 bars for {}.{} — trying gateway discovery",
                symbol, exchange
            );
        }
        Ok(Err(e)) => {
            tracing::warn!(
                "history-ticks: HistoryPlant error for {}.{}: {} — trying gateway discovery",
                symbol, exchange, e
            );
        }
        Err(_timeout) => {
            tracing::warn!(
                "history-ticks: HistoryPlant timed out for {}.{} — trying gateway discovery",
                symbol, exchange
            );
        }
    }

    // Découverte du gateway HistoryPlant régional — même logique que history.rs.
    let discovered = gateway_discovery::discover_history_gateway(
        gateway_url,
        &creds.system_name,
    )
    .await;

    if let Some(ref new_url) = discovered {
        if new_url.as_str() != gateway_url {
            tracing::info!(
                "history-ticks: retrying HistoryPlant on discovered gateway: {} for {}.{}",
                new_url, symbol, exchange
            );
            return timeout(
                REPLAY_TIMEOUT,
                fetch_inner(
                    new_url, creds, symbol, exchange, bar_minutes, hours_back,
                    tick_size, SysInfraType::HistoryPlant, app,
                ),
            )
            .await
            .map_err(|_| {
                ConnectorError::Other(
                    "tick history (discovered gateway) timed out".into(),
                )
            })?;
        } else {
            tracing::info!(
                "history-ticks: gateway découvert identique au vault ({}) — pas de retry",
                new_url
            );
        }
    }

    Ok(TickFetchResult { bars: vec![], rp_codes: vec![] })
}

/// Returned by both `fetch_inner` (tick replay) and `fetch_volume_profile_bars`
/// so the command layer can include rp_codes in its IPC return value instead of
/// relying solely on progress events (which have a JS race with the invoke promise).
pub struct TickFetchResult {
    pub bars: Vec<TickHistoryBar>,
    /// Accumulated rp_codes from every terminator frame seen during the drain.
    /// Typically ["13", "permission denied"] when Apex denies the request.
    pub rp_codes: Vec<String>,
}

/// Payload emitted to the React layer after every drained chunk so
/// the UI can render a "Loading … 67 %" progress badge instead of a
/// static spinner. Keeps the user from thinking the app is hung.
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
    /// True when the fetch is done (success or break). Lets the front
    /// hide the progress badge without having to also listen for the
    /// invoke promise resolution.
    done: bool,
    /// rp_codes accumulated from every terminator frame seen during
    /// the drain. Empty unless Apex sent a status code (typically the
    /// final terminator has one). Surfaced to React so 0-bar fetches
    /// can be diagnosed without `RUST_LOG=info`. Values are sent as
    /// strings because Apex defines rp_code as a repeated string in
    /// `response_tick_bar_replay.proto`.
    rp_codes: Vec<String>,
    /// rq_handler_rp_codes — secondary status channel from the
    /// gateway. Sometimes Apex returns errors here (permissioning,
    /// quota) while leaving `rp_code` empty. Bundled with rp_codes
    /// for the same diagnostic reason.
    rq_handler_rp_codes: Vec<String>,
    /// user_msg echoes Apex sometimes pipes into the terminator
    /// frame (e.g. "tick data limit exceeded"). Surfaced as well.
    user_msgs: Vec<String>,
}

async fn fetch_inner(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
    bar_minutes: i32,
    hours_back: i64,
    tick_size: Option<f64>,
    infra_type: SysInfraType,
    app: Option<AppHandle>,
) -> Result<TickFetchResult> {
    let mut client = RithmicClient::new();
    tracing::info!("history-ticks: connecting to {}", gateway_url);
    client.connect(gateway_url).await?;

    let login_req = RequestLogin {
        template_id: REQUEST_LOGIN,
        template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
        user_msg: vec!["history-ticks".into()],
        user: Some(creds.username.clone()),
        password: Some(creds.password.clone()),
        app_name: Some(creds.app_name.clone()),
        app_version: Some(creds.app_version.clone()),
        system_name: Some(creds.system_name.clone()),
        infra_type: Some(infra_type as i32),
        mac_addr: vec![],
        os_version: None,
        os_platform: None,
        aggregated_quotes: None,
    };
    tracing::info!("history-ticks: sending RequestLogin ({:?})", infra_type);
    client.send(&login_req).await?;
    let login_resp: ResponseLogin = client.recv().await?;
    if login_resp.template_id != 11 {
        write_history_debug(&format!(
            "[TICK] LOGIN UNEXPECTED template_id={} gateway={} infra={:?} (expected 11)",
            login_resp.template_id, gateway_url, infra_type
        ));
        let _ = client.close().await;
        return Err(ConnectorError::UnexpectedMessage(login_resp.template_id));
    }
    if !login_resp.rp_code.iter().any(|c| c == "0") {
        write_history_debug(&format!(
            "[TICK] LOGIN REJECTED gateway={} infra={:?} rp_code={:?} user_msg={:?}",
            gateway_url, infra_type, login_resp.rp_code, login_resp.user_msg
        ));
        let _ = client.close().await;
        return Err(ConnectorError::AuthFailed(format!(
            "history-ticks login rejected: rp_code={:?} user_msg={:?}",
            login_resp.rp_code, login_resp.user_msg
        )));
    }
    write_history_debug(&format!(
        "[TICK] LOGIN OK gateway={} system_name={} user={} infra={:?} symbol={}.{} hours_back={} login_rp_code={:?}",
        gateway_url, creds.system_name, creds.username, infra_type, symbol, exchange, hours_back, login_resp.rp_code
    ));
    tracing::info!("history-ticks: login OK");

    // ── Walk chunks until we cover [start_index, finish_index] ────────
    // Apex's HISTORY_PLANT caps each TickBarReplay response at ~10 000
    // frames. For an active futures session (MNQ during NY hours) that's
    // ≈ 5-10 minutes of real time. To cover an entire 24h window we
    // re-fire RequestTickBarReplay with `start_index = last_tick_ts + 1`
    // after each end-of-stream marker, and stop when either:
    //   • the latest tick we received is ≥ finish_index - 5s, or
    //   • a chunk returned 0 new ticks (stale slot, market gap), or
    //   • we hit the MAX_CHUNKS safety cap.
    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let initial_start = now_sec - hours_back.max(1) * 3600;
    let finish_index = now_sec;

    // Diagnostic: log the absolute window so we can verify the
    // Globex session bounds at a glance. CME Globex resets at 17:00 CT
    // (= 22:00 UTC in CST / 21:00 UTC in CDT). When the user's local
    // midnight (the JS-side filter anchor) sits BEFORE the most recent
    // Globex open, we should expect Apex to return a partial day; if
    // it sits AFTER, the response should cover from open → now.
    //
    // DEBUG-REPLAY-WINDOW (étape 2): log the window in UTC + CT + Paris
    // so we can see at a glance whether the start anchor lands inside
    // an active Globex session or not. Unit is Unix epoch SECONDS
    // (int32 on the wire — proto `start_index`/`finish_index`).
    tracing::info!(
        "history-ticks: replay window — start_index={} (epoch s, int32 on wire), finish_index={}, hours_back={}, gateway={}",
        initial_start, finish_index, hours_back, gateway_url,
    );
    tracing::info!(
        "history-ticks:   start  UTC   = {}",
        fmt_epoch_iso(initial_start)
    );
    tracing::info!(
        "history-ticks:   start  CT    = {}  (UTC-5h, CDT — valid Mar→Nov)",
        fmt_epoch_with_offset(initial_start, -5)
    );
    tracing::info!(
        "history-ticks:   start  Paris = {}  (UTC+2h, CEST — valid late-Mar→late-Oct)",
        fmt_epoch_with_offset(initial_start, 2)
    );
    tracing::info!(
        "history-ticks:   finish UTC   = {}",
        fmt_epoch_iso(finish_index)
    );
    tracing::info!(
        "history-ticks:   finish CT    = {}",
        fmt_epoch_with_offset(finish_index, -5)
    );
    tracing::info!(
        "history-ticks:   finish Paris = {}",
        fmt_epoch_with_offset(finish_index, 2)
    );

    let bucket_size_sec = (bar_minutes.max(1) as u64) * 60;
    let mut bars: BTreeMap<u64, BarAcc> = BTreeMap::new();

    // FORWARD CHUNKING — aligned with the canonical async_rithmic
    // pattern (https://github.com/rundef/async_rithmic): pass only
    // `time_order=Forwards` and leave `direction` UNSET. Walks
    // `cursor` forward from `initial_start` toward `finish_index`.
    // After each chunk with ticks we advance `cursor =
    // latest_tick_sec + 1` to pick up where the last chunk stopped.
    // Zero-tick chunks step the cursor forward by 2h to skip Globex
    // pauses / weekends without bailing.
    //
    // The earlier `Last + Backwards` attempt (per a misread of
    // CLAUDE.md leçon 7.C) is dropped: real-world Apex clients —
    // pyrithmic, async_rithmic, rithmic-rs samples — all use the
    // Forwards / unset-direction pattern and it works once the
    // account is permissioned for HISTORY_PLANT replay.
    let mut cursor: i64 = initial_start;
    let mut total_frames: u32 = 0;
    let mut total_ticks_kept: u32 = 0;
    let mut chunks: u32 = 0;
    // Accumulated status strings from every terminator frame seen
    // during the drain. Forwarded to React in the final progress
    // event so 0-bar fetches surface Apex's "why" instead of a
    // generic "market closed" guess. Deduped on insert so identical
    // codes from each chunk's terminator don't flood the log.
    let mut all_rp_codes: Vec<String> = Vec::new();
    let mut all_rq_handler_rp_codes: Vec<String> = Vec::new();
    let mut all_user_msgs: Vec<String> = Vec::new();
    // 300 chunks × ~10k frames each = up to ~3M ticks — well over a
    // typical MNQ 24h day (which is closer to 30-60 chunks during NY
    // hours).
    const MAX_CHUNKS: u32 = 300;
    /// Cursor jump when a chunk returns zero ticks (Globex pause,
    /// weekend, illiquid period). 2h covers a Globex pause + slack
    /// without overshooting active liquidity on either side.
    const ZERO_TICKS_SKIP_SEC: i64 = 7200;

    loop {
        chunks += 1;
        if chunks > MAX_CHUNKS {
            tracing::warn!(
                "history-ticks: BREAK reason=MAX_CHUNKS — cap={} cursor={} ({} UTC) start={} ({} UTC) total_ticks={}",
                MAX_CHUNKS, cursor, fmt_epoch_iso(cursor), initial_start, fmt_epoch_iso(initial_start), total_ticks_kept
            );
            break;
        }
        if cursor >= finish_index - 5 {
            tracing::info!(
                "history-ticks: BREAK reason=REACHED_FINISH_PRE — cursor={} ({} UTC) ≥ finish-5={}",
                cursor,
                fmt_epoch_iso(cursor),
                finish_index - 5,
            );
            break;
        }

        // Canonical async_rithmic shape: only set time_order=Forwards,
        // leave `direction` unset. `user_msg` carries the bare symbol
        // (matches `user_msg=symbol` in async_rithmic/plants/history.py).
        let replay_req = RequestTickBarReplay {
            template_id: REQUEST_TICK_BAR_REPLAY,
            user_msg: vec![symbol.to_string()],
            symbol: Some(symbol.to_string()),
            exchange: Some(exchange.to_string()),
            bar_type: Some(BarType::TickBar as i32),
            bar_sub_type: Some(BarSubType::Regular as i32),
            bar_type_specifier: Some("1".into()),
            start_index: Some(cursor as i32),
            finish_index: Some(finish_index as i32),
            user_max_count: None,
            custom_session_open_ssm: None,
            custom_session_close_ssm: None,
            direction: None,
            time_order: Some(TimeOrder::Forwards as i32),
            resume_bars: None,
        };
        tracing::info!(
            "history-ticks: ── chunk#{:03} START (Forwards, direction unset) cursor={} ({} UTC) ──",
            chunks,
            cursor,
            fmt_epoch_iso(cursor),
        );
        client.send(&replay_req).await?;

        let chunk = drain_chunk(&mut client, &mut bars, bucket_size_sec, tick_size).await?;
        total_frames += chunk.frames_seen;
        total_ticks_kept += chunk.ticks_kept;
        // Dedup-insert status strings from this chunk's terminator so
        // the final event carries a single "Apex said …" line rather
        // than 60 copies of the same code.
        for c in &chunk.rp_codes {
            if !all_rp_codes.contains(c) {
                all_rp_codes.push(c.clone());
            }
        }
        for c in &chunk.rq_handler_rp_codes {
            if !all_rq_handler_rp_codes.contains(c) {
                all_rq_handler_rp_codes.push(c.clone());
            }
        }
        for m in &chunk.user_msgs {
            if !all_user_msgs.contains(m) {
                all_user_msgs.push(m.clone());
            }
        }

        // rp_code=13 = permission denied — retrying more chunks wastes
        // ~12 × 12s. Break immediately so the user sees the error fast.
        if all_rp_codes.iter().any(|c| c == "13") || all_rq_handler_rp_codes.iter().any(|c| c == "13") {
            write_history_debug(&format!(
                "[TICK] BREAK reason=PERMISSION_DENIED(rp_code=13) chunk#{} symbol={}.{} rp_codes={:?}",
                chunks, symbol, exchange, all_rp_codes
            ));
            tracing::warn!(
                "history-ticks: BREAK reason=PERMISSION_DENIED — rp_code=13 on chunk#{} {}. {}",
                chunks, symbol, exchange
            );
            break;
        }

        if let Some(handle) = app.as_ref() {
            let _ = handle.emit(
                "rithmic-history-progress",
                HistoryProgressEvent {
                    symbol,
                    exchange,
                    bar_minutes,
                    chunks_processed: chunks,
                    max_chunks: MAX_CHUNKS,
                    bars_bucketed: bars.len(),
                    total_ticks_kept,
                    latest_tick_sec: chunk.latest_tick_sec,
                    finish_index,
                    done: false,
                    rp_codes: all_rp_codes.clone(),
                    rq_handler_rp_codes: all_rq_handler_rp_codes.clone(),
                    user_msgs: all_user_msgs.clone(),
                },
            );
        }

        tracing::info!(
            "history-ticks: chunk#{:03} END — frames={} ticks={} total_ticks={} bars={}",
            chunks,
            chunk.frames_seen,
            chunk.ticks_kept,
            total_ticks_kept,
            bars.len()
        );
        if chunk.ticks_kept > 0 {
            tracing::info!(
                "history-ticks: chunk#{:03} range = [{} → {}] UTC (span {}s)",
                chunks,
                fmt_epoch_iso(chunk.first_tick_sec),
                fmt_epoch_iso(chunk.latest_tick_sec),
                chunk.latest_tick_sec - chunk.first_tick_sec,
            );
        }

        // No ticks for this window — Globex pause, weekend, illiquid
        // gap, or Apex archive miss. Step the cursor FORWARD by 2h to
        // skip past the dead zone instead of bailing.
        if chunk.ticks_kept == 0 {
            let new_cursor = cursor + ZERO_TICKS_SKIP_SEC;
            if new_cursor >= finish_index {
                tracing::info!(
                    "history-ticks: BREAK reason=ZERO_TICKS_AT_END — chunk#{:03} skipped past finish",
                    chunks
                );
                break;
            }
            tracing::info!(
                "history-ticks: chunk#{:03} ZERO_TICKS — stepping cursor {} → {} (+{}s)",
                chunks,
                cursor,
                new_cursor,
                ZERO_TICKS_SKIP_SEC,
            );
            cursor = new_cursor;
            tokio::time::sleep(Duration::from_millis(100)).await;
            continue;
        }

        if chunk.latest_tick_sec >= finish_index - 5 {
            tracing::info!(
                "history-ticks: BREAK reason=REACHED_FINISH — chunk#{:03} latest={} ≥ finish-5={}",
                chunks,
                chunk.latest_tick_sec,
                finish_index - 5,
            );
            break;
        }

        let prev_cursor = cursor;
        cursor = chunk.latest_tick_sec + 1;
        tracing::info!(
            "history-ticks: chunk#{:03} CONTINUE — cursor advance {} → {} (+{}s)",
            chunks,
            prev_cursor,
            cursor,
            cursor - prev_cursor
        );

        // Gentle rate-limit between chunks.
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    tracing::info!(
        "history-ticks: drain complete — {} chunks, {} frames, {} ticks bucketed into {} bars",
        chunks,
        total_frames,
        total_ticks_kept,
        bars.len()
    );

    // Final progress event — signals the front-end to clear the
    // loading badge even if it lost a chunk event along the way.
    // Carries the accumulated rp_codes / rq_handler_rp_codes / user_msgs
    // so React can diagnose a 0-bar response without having to enable
    // `RUST_LOG=info`.
    if let Some(handle) = app.as_ref() {
        let _ = handle.emit(
            "rithmic-history-progress",
            HistoryProgressEvent {
                symbol,
                exchange,
                bar_minutes,
                chunks_processed: chunks,
                max_chunks: MAX_CHUNKS,
                bars_bucketed: bars.len(),
                total_ticks_kept,
                latest_tick_sec: 0,
                finish_index,
                done: true,
                rp_codes: all_rp_codes.clone(),
                rq_handler_rp_codes: all_rq_handler_rp_codes.clone(),
                user_msgs: all_user_msgs.clone(),
            },
        );
    }
    tracing::info!(
        "history-ticks: APEX STATUS — rp_codes={:?} rq_handler_rp_codes={:?} user_msgs={:?}",
        all_rp_codes, all_rq_handler_rp_codes, all_user_msgs,
    );
    write_history_debug(&format!(
        "[TICK] DRAIN DONE gateway={} symbol={}.{} chunks={} total_ticks={} bars={} rp_codes={:?} rq_handler={:?} user_msgs={:?}",
        gateway_url, symbol, exchange, chunks, total_ticks_kept, bars.len(),
        all_rp_codes, all_rq_handler_rp_codes, all_user_msgs,
    ));

    // ── Logout + close ───────────────────────────────────────────────
    let logout = RequestLogout {
        template_id: REQUEST_LOGOUT,
        user_msg: vec![],
    };
    let _ = client.send(&logout).await;
    let _ = client.close().await;

    // ── Finalize bars ────────────────────────────────────────────────
    let mut out: Vec<TickHistoryBar> = Vec::with_capacity(bars.len());
    for (bucket_ts_sec, acc) in bars.into_iter() {
        out.push(acc.finalize(bucket_ts_sec));
    }
    tracing::info!(
        "history-ticks: reconstructed {} bars at {}m grain from {} ticks ({} frames over {} chunks)",
        out.len(), bar_minutes, total_ticks_kept, total_frames, chunks
    );
    Ok(TickFetchResult { bars: out, rp_codes: all_rp_codes })
}

/// Per-chunk stats returned by `drain_chunk` so the outer loop can
/// decide whether to fire another chunk and where the next cursor
/// should land.
struct ChunkStats {
    frames_seen: u32,
    ticks_kept: u32,
    /// Highest `ssboe` (seconds-since-epoch) we ingested in this chunk.
    /// 0 if no ticks were ingested.
    latest_tick_sec: i64,
    /// Lowest `ssboe` we ingested in this chunk. Used by the
    /// backward-walking chunker to step the upper bound (`finish`)
    /// down for the next request. 0 if no ticks were ingested.
    first_tick_sec: i64,
    /// rp_code strings captured from the terminator frame of this
    /// chunk. Apex sometimes pipes "tick data limit exceeded" or a
    /// permissioning error in here while leaving the bar payload
    /// empty — this is the only signal we have when 0 ticks come
    /// back. Propagated up to the React layer via the final
    /// `rithmic-history-progress` event so the user can see exactly
    /// what Apex said.
    rp_codes: Vec<String>,
    rq_handler_rp_codes: Vec<String>,
    user_msgs: Vec<String>,
}

/// Drain frames from the open HistoryPlant socket until the next
/// end-of-stream marker (one chunk's worth of TickBarReplay output).
/// Ingests every valid tick into `bars` keyed by the bucket second.
/// Format a unix epoch (seconds) as "YYYY-MM-DD HH:MM:SS". Inline
/// implementation — no chrono dependency required for a single
/// diagnostic line.
///
/// DEBUG-REPLAY-WINDOW (étape 2): companion helper that applies a
/// fixed integer hour offset before formatting, used to print CT and
/// Paris alongside UTC. Does NOT handle DST transitions — caller must
/// pick the correct offset for the current season (-5/-6 for CT,
/// +1/+2 for Paris). Logs are temporary diagnostic output.
fn fmt_epoch_with_offset(secs: i64, hours_offset: i64) -> String {
    fmt_epoch_iso(secs + hours_offset * 3600)
}

fn fmt_epoch_iso(secs: i64) -> String {
    let mut z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let day_secs = secs.rem_euclid(86_400);
    let h = day_secs / 3600;
    let mi = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    let _ = &mut z;
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, m, d, h, mi, s)
}

async fn drain_chunk(
    client: &mut RithmicClient,
    bars: &mut BTreeMap<u64, BarAcc>,
    bucket_size_sec: u64,
    tick_size: Option<f64>,
) -> Result<ChunkStats> {
    let mut frames_seen: u32 = 0;
    let mut ticks_kept: u32 = 0;
    let mut ticks_skipped_no_price: u32 = 0;
    let mut ticks_skipped_no_aggressor: u32 = 0;
    let mut latest_tick_sec: i64 = 0;
    // DEBUG-DRAIN (étape 2): capture the FIRST and LAST tick ssboe of
    // the chunk so we can verify the chunk really spans what we asked
    // for. Apex sometimes returns a chunk whose ssboe values are all
    // inside a tiny window even when start_index moved forward, which
    // would explain a "no progress" symptom.
    let mut first_tick_sec: i64 = 0;
    let mut unexpected_templates: u32 = 0;

    loop {
        let raw = client.recv_raw().await?;
        let probe = TemplateProbe::decode(raw.as_slice())?;
        if probe.template_id != RESPONSE_TICK_BAR_REPLAY {
            unexpected_templates += 1;
            tracing::debug!(
                "history-ticks: skipping unexpected template_id {} (expected {}) — total unexpected this chunk: {}",
                probe.template_id, RESPONSE_TICK_BAR_REPLAY, unexpected_templates
            );
            continue;
        }
        frames_seen += 1;
        let frame = ResponseTickBarReplay::decode(raw.as_slice())?;

        let has_bar = frame.open_price.is_some()
            && frame.volume.is_some()
            && !frame.data_bar_ssboe.is_empty();
        let has_terminator = !frame.rp_code.is_empty() || !frame.rq_handler_rp_code.is_empty();
        if has_terminator && !has_bar {
            // DEBUG-TERMINATOR (étape 2): dump the full terminator
            // frame so we can tell whether Apex distinguishes
            // "end of THIS chunk" vs "end of replay (no more data)"
            // via rp_code content. Without seeing real values we
            // can't model the distinction yet.
            let first_ssboe = frame.data_bar_ssboe.first().copied().unwrap_or(0);
            tracing::info!(
                "history-ticks: TERMINATOR frame — template_id={} rp_code={:?} rq_handler_rp_code={:?} user_msg={:?} request_key={:?} has_bar={} first_ssboe={}",
                frame.template_id, frame.rp_code, frame.rq_handler_rp_code,
                frame.user_msg, frame.request_key, has_bar, first_ssboe,
            );
            tracing::info!(
                "history-ticks: chunk end stats — frames={} ticks={} unexpected_tpl={} skipped(no_price)={} skipped(no_aggressor)={} first_ts={} ({} UTC) latest_ts={} ({} UTC) span={}s",
                frames_seen, ticks_kept, unexpected_templates,
                ticks_skipped_no_price, ticks_skipped_no_aggressor,
                first_tick_sec, fmt_epoch_iso(first_tick_sec),
                latest_tick_sec, fmt_epoch_iso(latest_tick_sec),
                if first_tick_sec > 0 && latest_tick_sec > 0 { latest_tick_sec - first_tick_sec } else { 0 },
            );
            // Capture status strings from the terminator and bail.
            // These flow back to the IPC caller (and React) so a
            // diagnostic "0 bars" run shows WHY Apex returned nothing.
            let rp_codes: Vec<String> = frame.rp_code.iter().cloned().collect();
            let rq_handler_rp_codes: Vec<String> =
                frame.rq_handler_rp_code.iter().cloned().collect();
            let user_msgs: Vec<String> = frame.user_msg.iter().cloned().collect();
            return Ok(ChunkStats {
                frames_seen,
                ticks_kept,
                latest_tick_sec,
                first_tick_sec,
                rp_codes,
                rq_handler_rp_codes,
                user_msgs,
            });
        }
        if !has_bar {
            continue;
        }

        let price = match frame.open_price {
            Some(p) if p > 0.0 => p,
            _ => {
                ticks_skipped_no_price += 1;
                continue;
            }
        };
        let volume = frame.volume.unwrap_or(0) as f64;
        let bid_vol = frame.bid_volume.unwrap_or(0) as f64;
        let ask_vol = frame.ask_volume.unwrap_or(0) as f64;
        let trade_count = frame.num_trades.unwrap_or(1) as u32;
        let ssboe = *frame.data_bar_ssboe.first().unwrap_or(&0) as i64;
        if ssboe <= 0 {
            ticks_skipped_no_price += 1;
            continue;
        }
        // `first_tick_sec` = earliest ssboe ingested (min), used by the
        // backward chunker to step the upper bound down for the next
        // request. `latest_tick_sec` = latest ssboe ingested (max).
        // Both are independent of delivery order, so the same drain
        // works for `Forwards` (oldest first) and `Backwards` (newest
        // first) streaming.
        if first_tick_sec == 0 || ssboe < first_tick_sec {
            first_tick_sec = ssboe;
        }
        if ssboe > latest_tick_sec {
            latest_tick_sec = ssboe;
        }

        // In ResponseTickBarReplay the field names reflect the AGGRESSOR's
        // action, not the passive side:
        //   bid_volume = aggressor was a BUYER  (hit-the-offer / "bid for it")
        //   ask_volume = aggressor was a SELLER (hit-the-bid  / "ask to sell")
        //
        // This is the opposite of the CME passive-side convention used in
        // live LastTrade frames (where ask_vol = buy-side matched). The live
        // path is unambiguous because it carries TransactionType::Buy/Sell
        // directly, so the discrepancy only surfaces in tick replay.
        let buy_volume = bid_vol;
        let sell_volume = ask_vol;
        if buy_volume == 0.0 && sell_volume == 0.0 {
            ticks_skipped_no_aggressor += 1;
        }
        let buy_trades = if bid_vol > 0.0 && ask_vol == 0.0 {
            trade_count
        } else if bid_vol == 0.0 && ask_vol > 0.0 {
            0
        } else if bid_vol + ask_vol > 0.0 {
            ((trade_count as f64) * (bid_vol / (bid_vol + ask_vol))).round() as u32
        } else {
            0
        };
        let sell_trades = trade_count.saturating_sub(buy_trades);

        // Snap to the instrument tick grid (MNQ=0.25, CL=0.01, etc.)
        // before bucketing. Apex tick replay returns f64 prices that
        // *should* be on-grid but can carry float-round-trip noise
        // (21345.249999 vs 21345.250001); without snapping, the
        // BarAcc.levels BTreeMap would create two distinct keys for
        // the same logical price → renderer sees sub-tick gaps and
        // shrinks the row height accordingly.
        let snapped = match tick_size {
            Some(ts) if ts > 0.0 => (price / ts).round() * ts,
            _ => price,
        };
        let bucket_ts_sec = (ssboe as u64 / bucket_size_sec) * bucket_size_sec;
        let acc = bars
            .entry(bucket_ts_sec)
            .or_insert_with(|| BarAcc::new(snapped));
        acc.ingest(
            snapped,
            volume,
            buy_volume,
            sell_volume,
            buy_trades,
            sell_trades,
        );
        ticks_kept += 1;

        // Hard safety cap per chunk so a runaway response can't OOM us.
        if frames_seen >= 50_000 {
            tracing::warn!(
                "history-ticks: per-chunk safety cap hit at {} frames",
                frames_seen
            );
            break;
        }
    }

    Ok(ChunkStats {
        frames_seen,
        ticks_kept,
        latest_tick_sec,
        first_tick_sec,
        // Reached the safety cap without a terminator. No status
        // strings observed; the upstream loop will retry with a new
        // window.
        rp_codes: Vec::new(),
        rq_handler_rp_codes: Vec::new(),
        user_msgs: Vec::new(),
    })
}

/// Mutable accumulator for one footprint bar while we stream ticks
/// in chronological order.
struct BarAcc {
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    total_volume: f64,
    total_buy_volume: f64,
    total_sell_volume: f64,
    trade_count: u32,
    /// Price → (buy_vol, sell_vol, buy_trades, sell_trades).
    /// Keyed by integer price-in-100k-ticks-style to avoid f64 hash issues.
    /// We use the raw f64 prices and round to 6 decimals when bucketing —
    /// MNQ tick = 0.25 so 6 decimals is overkill and safe.
    levels: BTreeMap<i64, LevelAcc>,
}

struct LevelAcc {
    price: f64,
    buy_volume: f64,
    sell_volume: f64,
    buy_trades: u32,
    sell_trades: u32,
}

impl BarAcc {
    fn new(first_price: f64) -> Self {
        Self {
            open: first_price,
            high: first_price,
            low: first_price,
            close: first_price,
            total_volume: 0.0,
            total_buy_volume: 0.0,
            total_sell_volume: 0.0,
            trade_count: 0,
            levels: BTreeMap::new(),
        }
    }

    fn ingest(
        &mut self,
        price: f64,
        volume: f64,
        buy_vol: f64,
        sell_vol: f64,
        buy_trades: u32,
        sell_trades: u32,
    ) {
        if price > self.high {
            self.high = price;
        }
        if price < self.low {
            self.low = price;
        }
        self.close = price;
        self.total_volume += volume;
        self.total_buy_volume += buy_vol;
        self.total_sell_volume += sell_vol;
        self.trade_count = self.trade_count.saturating_add(buy_trades + sell_trades);

        // Quantize to 1e-6 for the level key — MNQ tick=0.25 etc, all
        // well above 1µ price, so collisions are exact same-price
        // ticks (which is exactly what we want to aggregate).
        let key = (price * 1_000_000.0).round() as i64;
        let lvl = self.levels.entry(key).or_insert_with(|| LevelAcc {
            price,
            buy_volume: 0.0,
            sell_volume: 0.0,
            buy_trades: 0,
            sell_trades: 0,
        });
        lvl.buy_volume += buy_vol;
        lvl.sell_volume += sell_vol;
        lvl.buy_trades = lvl.buy_trades.saturating_add(buy_trades);
        lvl.sell_trades = lvl.sell_trades.saturating_add(sell_trades);
    }

    fn finalize(self, bucket_ts_sec: u64) -> TickHistoryBar {
        let mut levels: Vec<TickHistoryLevel> = self
            .levels
            .into_values()
            .map(|l| TickHistoryLevel {
                price: l.price,
                buy_volume: l.buy_volume,
                sell_volume: l.sell_volume,
                buy_trades: l.buy_trades,
                sell_trades: l.sell_trades,
            })
            .collect();
        // Sort ascending so the renderer's pre-pass over levels finds
        // contiguous price rows.
        levels.sort_by(|a, b| {
            a.price
                .partial_cmp(&b.price)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        TickHistoryBar {
            bucket_ts_ns: bucket_ts_sec * 1_000_000_000,
            open: self.open,
            high: self.high,
            low: self.low,
            close: self.close,
            total_volume: self.total_volume,
            total_delta: self.total_buy_volume - self.total_sell_volume,
            trade_count: self.trade_count,
            levels,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// VolumeProfileMinuteBars — pre-aggregated footprint history (HistoryPlant)
// ─────────────────────────────────────────────────────────────────────────────
//
// Unlike tick replay (206/207), this endpoint returns one bar per response
// frame already containing `profile_price[]`, `profile_bid_volume[]` and
// `profile_ask_volume[]` — i.e. the per-price footprint data ready to render,
// no bucketing required.  It requires a different (potentially less restrictive)
// Rithmic entitlement than raw tick replay, which is why it can work on systems
// that return rp_code 13 for RequestTickBarReplay.
//
// Convention (same as TickBarReplay, confirmed by field naming in the proto):
//   profile_bid_volume[i] = aggressor BUYER volume at price[i]  → buy_volume
//   profile_ask_volume[i] = aggressor SELLER volume at price[i] → sell_volume

/// Fetch footprint bars via RequestVolumeProfileMinuteBars (template 501).
/// Returns oldest → newest, same `TickHistoryBar` type as tick replay so the
/// command layer treats both paths identically.
pub async fn fetch_volume_profile_bars(
    gateway_url: &str,
    creds: &Credentials,
    symbol: &str,
    exchange: &str,
    bar_minutes: i32,
    hours_back: i64,
    tick_size: Option<f64>,
) -> Result<TickFetchResult> {
    let mut client = RithmicClient::new();
    tracing::info!("[vp] connecting to {}", gateway_url);
    client.connect(gateway_url).await?;

    let login_req = RequestLogin {
        template_id: REQUEST_LOGIN,
        template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
        user_msg: vec!["vp-history".into()],
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
    client.send(&login_req).await?;
    let login_resp: ResponseLogin = client.recv().await?;
    if login_resp.template_id != 11 {
        client.close().await.ok();
        return Err(ConnectorError::UnexpectedMessage(login_resp.template_id));
    }
    if !login_resp.rp_code.iter().any(|c| c == "0") {
        write_history_debug(&format!(
            "[VP] LOGIN REJECTED gateway={} rp_code={:?}",
            gateway_url, login_resp.rp_code
        ));
        client.close().await.ok();
        return Err(ConnectorError::AuthFailed(format!(
            "vp-history login rejected: rp_code={:?}",
            login_resp.rp_code
        )));
    }
    write_history_debug(&format!(
        "[VP] LOGIN OK gateway={} system_name={} user={} symbol={}.{} bar_min={} hours_back={} login_rp_code={:?}",
        gateway_url, creds.system_name, creds.username, symbol, exchange, bar_minutes, hours_back, login_resp.rp_code
    ));

    let now_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let effective_hours = hours_back.max(36);
    let start_index = now_sec - effective_hours * 3600;
    let finish_index = now_sec;

    let req = RequestVolumeProfileMinuteBars {
        template_id: REQUEST_VOLUME_PROFILE,
        user_msg: vec![symbol.to_string()],
        symbol: Some(symbol.to_string()),
        exchange: Some(exchange.to_string()),
        bar_type_period: Some(bar_minutes),
        start_index: Some(start_index as i32),
        finish_index: Some(finish_index as i32),
        user_max_count: None,
        resume_bars: None,
    };
    tracing::info!(
        "[vp] requesting VolumeProfileMinuteBars for {}.{} bar_min={} window={}..{}",
        symbol, exchange, bar_minutes, start_index, finish_index
    );
    client.send(&req).await?;

    let mut bars: Vec<TickHistoryBar> = Vec::new();
    let mut frames_seen: u32 = 0;
    let mut rp_codes: Vec<String> = Vec::new();
    let mut unknown_templates: Vec<i32> = Vec::new();

    // Per-frame timeout: if the server ignores template 501 it simply sends nothing.
    // The first frame should arrive within a few seconds; if it doesn't, bail fast.
    // Subsequent frames can take longer for large datasets, so we allow up to 10s
    // between frames after the first one.
    let mut first_frame = true;
    loop {
        let recv_timeout = if first_frame {
            Duration::from_secs(8)
        } else {
            Duration::from_secs(10)
        };
        let raw = match tokio::time::timeout(recv_timeout, client.recv_raw()).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => {
                write_history_debug(&format!(
                    "[VP] recv_raw error after {} frames: {}",
                    frames_seen, e
                ));
                break;
            }
            Err(_) => {
                write_history_debug(&format!(
                    "[VP] recv_raw timed out after {}s (frame#{}), server likely ignoring template 501",
                    if first_frame { 8 } else { 10 }, frames_seen
                ));
                break;
            }
        };
        first_frame = false;
        let probe = crate::connectors::rithmic::client::TemplateProbe::decode(raw.as_slice())?;
        frames_seen += 1;

        if probe.template_id != RESPONSE_VOLUME_PROFILE {
            if !unknown_templates.contains(&probe.template_id) {
                unknown_templates.push(probe.template_id);
                // This log is critical: if 502 is wrong, the real ID will appear here.
                write_history_debug(&format!(
                    "[VP] UNEXPECTED template_id={} (expected {}) frame#{}",
                    probe.template_id, RESPONSE_VOLUME_PROFILE, frames_seen
                ));
            }
            // Skip heartbeats / stray frames — but cap to avoid infinite loop.
            if frames_seen > 5_000 {
                write_history_debug("[VP] cap hit without end-of-stream — aborting");
                break;
            }
            continue;
        }

        use prost::Message as ProstMessage;
        let frame = ResponseVolumeProfileMinuteBars::decode(raw.as_slice())?;

        for c in frame.rp_code.iter() {
            if !rp_codes.contains(c) {
                rp_codes.push(c.clone());
            }
        }

        let marker = frame.marker.unwrap_or(0) as i64;
        let has_bar = marker > 0 && frame.open_price.is_some();
        let has_terminator = !frame.rp_code.is_empty() || !frame.rq_handler_rp_code.is_empty();

        if has_terminator && !has_bar {
            write_history_debug(&format!(
                "[VP] DRAIN DONE gateway={} symbol={}.{} frames={} bars={} rp_codes={:?} unknown_templates={:?}",
                gateway_url, symbol, exchange, frames_seen, bars.len(), rp_codes, unknown_templates
            ));
            break;
        }

        if has_bar {
            let levels: Vec<TickHistoryLevel> = frame
                .profile_price
                .iter()
                .enumerate()
                .filter_map(|(i, &raw_price)| {
                    let bid_vol = frame.profile_bid_volume.get(i).copied().unwrap_or(0);
                    let ask_vol = frame.profile_ask_volume.get(i).copied().unwrap_or(0);
                    if bid_vol == 0 && ask_vol == 0 {
                        return None;
                    }
                    let price = match tick_size {
                        Some(ts) if ts > 0.0 => (raw_price / ts).round() * ts,
                        _ => raw_price,
                    };
                    Some(TickHistoryLevel {
                        price,
                        buy_volume: bid_vol as f64,  // aggressor buyer → bid_vol
                        sell_volume: ask_vol as f64, // aggressor seller → ask_vol
                        buy_trades: frame
                            .profile_bid_aggressor_trades
                            .get(i)
                            .copied()
                            .unwrap_or(0) as u32,
                        sell_trades: frame
                            .profile_ask_aggressor_trades
                            .get(i)
                            .copied()
                            .unwrap_or(0) as u32,
                    })
                })
                .collect();

            let total_volume = frame.volume.unwrap_or(0) as f64;
            let bid_total = frame.bid_volume.unwrap_or(0) as f64;
            let ask_total = frame.ask_volume.unwrap_or(0) as f64;

            bars.push(TickHistoryBar {
                bucket_ts_ns: marker as u64 * 1_000_000_000,
                open: frame.open_price.unwrap_or(0.0),
                high: frame.high_price.unwrap_or(0.0),
                low: frame.low_price.unwrap_or(0.0),
                close: frame.close_price.unwrap_or(0.0),
                total_volume,
                total_delta: bid_total - ask_total, // bid aggressor = buy
                trade_count: frame.num_trades.unwrap_or(0) as u32,
                levels,
            });
        }

        if frames_seen > 10_000 {
            write_history_debug(&format!(
                "[VP] safety cap at {} frames ({} bars) — possible missing terminator",
                frames_seen, bars.len()
            ));
            break;
        }
    }

    let logout = RequestLogout {
        template_id: REQUEST_LOGOUT,
        user_msg: vec![],
    };
    let _ = client.send(&logout).await;
    let _ = client.close().await;

    Ok(TickFetchResult { bars, rp_codes })
}
