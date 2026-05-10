//! Phase 7.7.3 post-validation diagnostic.
//!
//! Captures the full raw `LastTrade` protobuf payload for ~20 ticks
//! (or until a 120s timeout) so we can answer: is the Rithmic Test
//! environment serving live CME data, delayed/throttled data, or
//! database-replay snapshots?
//!
//! The example bypasses the high-level RithmicAdapter (which splits
//! the socket and dispatches into the FootprintEngine) and drives
//! the wire protocol directly so we get the unmodified payload.
//!
//! Usage (PowerShell):
//!   $env:RITHMIC_TEST_USER     = "ryad.bouderga78@gmail.com"
//!   $env:RITHMIC_TEST_PASSWORD = "..."
//!   cargo run --example rithmic_trace
//!
//! Output:
//!   - Trace lines printed to stderr (live)
//!   - Full payload appended to ./rithmic_trace.log (gitignored via *.log)
//!   - On exit, prints summary stats (median latency, inter-tick gaps,
//!     snapshot fraction, etc.)

use std::fs::OpenOptions;
use std::io::Write;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use desktop_lib::connectors::rithmic::client::RithmicClient;
use desktop_lib::connectors::rithmic::proto::{
    request_login::SysInfraType,
    request_market_data_update::{Request as MdRequest, UpdateBits},
    LastTrade, RequestLogin, RequestLogout, RequestMarketDataUpdate, ResponseLogin,
};
use prost::Message;

const APP_NAME: &str = "OrderflowV2-Trace";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SYSTEM_NAME: &str = "Rithmic Test";
const GATEWAY_URL: &str = "wss://rituz00100.rithmic.com:443";
const TEMPLATE_VERSION: &str = "3.9";
const TARGET_TRADES: usize = 20;
const MAX_DURATION: Duration = Duration::from_secs(120);
const LOG_PATH: &str = "rithmic_trace.log";

fn now_ns() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos()
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let username = std::env::var("RITHMIC_TEST_USER")
        .map_err(|_| "RITHMIC_TEST_USER env var not set")?;
    let password = std::env::var("RITHMIC_TEST_PASSWORD")
        .map_err(|_| "RITHMIC_TEST_PASSWORD env var not set")?;
    let symbol =
        std::env::var("RITHMIC_SYMBOL").unwrap_or_else(|_| "MNQM6".to_string());
    let exchange =
        std::env::var("RITHMIC_EXCHANGE").unwrap_or_else(|_| "CME".to_string());

    let mut log = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(LOG_PATH)?;
    writeln!(
        log,
        "# Rithmic Test trace — symbol={symbol} exchange={exchange} system={SYSTEM_NAME}"
    )?;
    writeln!(log, "# capture_started_local_ns={}", now_ns())?;
    writeln!(log, "# gateway={GATEWAY_URL}")?;
    writeln!(
        log,
        "# columns: seq local_recv_ns ssboe usecs source_ssboe source_usecs source_nsecs jop_ssboe jop_nsecs exchange is_snapshot presence_bits clear_bits trade_price trade_size aggressor volume vwap"
    )?;

    let mut client = RithmicClient::new();
    client.connect(GATEWAY_URL).await?;
    eprintln!("[trace] connected");

    // Login (no SystemInfo handshake — gateway will close otherwise)
    let req = RequestLogin {
        template_id: 10,
        template_version: Some(TEMPLATE_VERSION.to_string()),
        user_msg: vec!["hello".to_string()],
        user: Some(username),
        password: Some(password),
        app_name: Some(APP_NAME.to_string()),
        app_version: Some(APP_VERSION.to_string()),
        system_name: Some(SYSTEM_NAME.to_string()),
        infra_type: Some(SysInfraType::TickerPlant as i32),
        mac_addr: vec![],
        os_version: None,
        os_platform: None,
        aggregated_quotes: None,
    };
    client.send(&req).await?;
    let resp: ResponseLogin = client.recv().await?;
    let primary = resp.rp_code.first().cloned().unwrap_or_default();
    if primary != "0" {
        return Err(format!("login failed: rp_code={:?}", resp.rp_code).into());
    }
    eprintln!(
        "[trace] login OK (fcm={} ib={} country={} state={} heartbeat={}s unique={})",
        resp.fcm_id.as_deref().unwrap_or(""),
        resp.ib_id.as_deref().unwrap_or(""),
        resp.country_code.as_deref().unwrap_or(""),
        resp.state_code.as_deref().unwrap_or(""),
        resp.heartbeat_interval.unwrap_or(0.0),
        resp.unique_user_id.as_deref().unwrap_or("")
    );
    writeln!(
        log,
        "# fcm={} ib={} country={} state={} heartbeat={}s unique_user_id={}",
        resp.fcm_id.as_deref().unwrap_or(""),
        resp.ib_id.as_deref().unwrap_or(""),
        resp.country_code.as_deref().unwrap_or(""),
        resp.state_code.as_deref().unwrap_or(""),
        resp.heartbeat_interval.unwrap_or(0.0),
        resp.unique_user_id.as_deref().unwrap_or("")
    )?;

    // Subscribe LAST_TRADE | BBO
    let sub = RequestMarketDataUpdate {
        template_id: 100,
        user_msg: vec![],
        symbol: Some(symbol.clone()),
        exchange: Some(exchange.clone()),
        request: Some(MdRequest::Subscribe as i32),
        update_bits: Some((UpdateBits::LastTrade as u32) | (UpdateBits::Bbo as u32)),
    };
    client.send(&sub).await?;
    eprintln!("[trace] subscribed {symbol}.{exchange}");

    // Drain frames, log every LastTrade.
    let started = Instant::now();
    let mut seq: usize = 0;
    let mut latencies_ms: Vec<i64> = Vec::new();
    let mut inter_tick_gaps_ns: Vec<u128> = Vec::new();
    let mut last_local_ns: Option<u128> = None;
    let mut snapshot_count: usize = 0;

    while seq < TARGET_TRADES && started.elapsed() < MAX_DURATION {
        let remaining = MAX_DURATION.saturating_sub(started.elapsed());
        let recv_fut = client.recv_probe();
        let timeout_fut = tokio::time::sleep(remaining);
        let (template_id, data) = tokio::select! {
            r = recv_fut => match r {
                Ok(v) => v,
                Err(e) => { eprintln!("[trace] recv error: {e}"); break; }
            },
            _ = timeout_fut => break,
        };

        let local_recv_ns = now_ns();

        match template_id {
            150 => {
                let t = LastTrade::decode(&data[..])?;
                seq += 1;
                if t.is_snapshot.unwrap_or(false) {
                    snapshot_count += 1;
                }

                // Source timestamp (exchange) → milliseconds since epoch
                let source_ms = match (t.source_ssboe, t.source_usecs) {
                    (Some(s), Some(us)) => Some((s as i64) * 1000 + (us as i64) / 1000),
                    _ => None,
                };
                let local_ms = (local_recv_ns / 1_000_000) as i64;
                if let Some(sm) = source_ms {
                    latencies_ms.push(local_ms - sm);
                }
                if let Some(prev) = last_local_ns {
                    inter_tick_gaps_ns.push(local_recv_ns - prev);
                }
                last_local_ns = Some(local_recv_ns);

                let line = format!(
                    "{seq} {local_recv_ns} {ssboe} {usecs} {sssboe} {susecs} {snsecs} {jssboe} {jnsecs} {ex} {snap} 0x{pres:x} 0x{clear:x} {price} {size} {aggr} {vol} {vwap}",
                    ssboe = t.ssboe.unwrap_or(0),
                    usecs = t.usecs.unwrap_or(0),
                    sssboe = t.source_ssboe.unwrap_or(0),
                    susecs = t.source_usecs.unwrap_or(0),
                    snsecs = t.source_nsecs.unwrap_or(0),
                    jssboe = t.jop_ssboe.unwrap_or(0),
                    jnsecs = t.jop_nsecs.unwrap_or(0),
                    ex = t.exchange.as_deref().unwrap_or(""),
                    snap = t.is_snapshot.unwrap_or(false),
                    pres = t.presence_bits.unwrap_or(0),
                    clear = t.clear_bits.unwrap_or(0),
                    price = t.trade_price.unwrap_or(0.0),
                    size = t.trade_size.unwrap_or(0),
                    aggr = t.aggressor.unwrap_or(0),
                    vol = t.volume.unwrap_or(0),
                    vwap = t.vwap.unwrap_or(0.0),
                );
                writeln!(log, "{line}")?;
                eprintln!(
                    "[#{seq:>2}] price={:.2} size={} aggr={} snapshot={} latency_ms={:?}",
                    t.trade_price.unwrap_or(0.0),
                    t.trade_size.unwrap_or(0),
                    t.aggressor.unwrap_or(0),
                    t.is_snapshot.unwrap_or(false),
                    source_ms.map(|sm| local_ms - sm),
                );
            }
            101 => {
                eprintln!("[trace] ResponseMarketDataUpdate ack");
            }
            151 => { /* BBO — skip in trace, we only need LastTrade payloads */ }
            other => {
                eprintln!("[trace] unhandled template {other}");
            }
        }
    }

    // Logout
    let lo = RequestLogout {
        template_id: 12,
        user_msg: vec![],
    };
    let _ = client.send(&lo).await;
    let _ = client.close().await;

    // Summary
    eprintln!("\n=== Summary ===");
    eprintln!("Captured trades: {seq}");
    eprintln!(
        "Of which is_snapshot=true: {snapshot_count} ({:.0}%)",
        if seq == 0 {
            0.0
        } else {
            100.0 * snapshot_count as f64 / seq as f64
        }
    );
    if !latencies_ms.is_empty() {
        let mut sorted = latencies_ms.clone();
        sorted.sort_unstable();
        let median = sorted[sorted.len() / 2];
        let max = *sorted.last().unwrap();
        let min = sorted[0];
        eprintln!("Source→local latency (ms): min={min} median={median} max={max}");
    }
    if !inter_tick_gaps_ns.is_empty() {
        let mut sorted = inter_tick_gaps_ns.clone();
        sorted.sort_unstable();
        let median_ms = sorted[sorted.len() / 2] / 1_000_000;
        let max_ms = *sorted.last().unwrap() / 1_000_000;
        let min_ms = sorted[0] / 1_000_000;
        eprintln!(
            "Inter-tick gap (ms): min={min_ms} median={median_ms} max={max_ms}"
        );
    }

    writeln!(log, "# capture_ended_local_ns={}", now_ns())?;
    writeln!(log, "# trades_captured={seq}")?;
    writeln!(log, "# is_snapshot_true={snapshot_count}")?;
    eprintln!("\nTrace log: {LOG_PATH}");

    Ok(())
}
