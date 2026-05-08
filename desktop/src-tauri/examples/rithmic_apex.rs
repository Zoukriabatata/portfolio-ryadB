//! Phase 7.9 — probe + login + stream against an arbitrary Rithmic
//! gateway. Built to validate the Apex Trader Funding production
//! credentials, but the URL/system/creds are all env-driven so it
//! also works for Rithmic 01, Rithmic Paper Trading, etc.
//!
//! Usage (PowerShell):
//!   $env:RITHMIC_USER     = "APEX-384631"
//!   $env:RITHMIC_PASSWORD = 'A#C0w75k6g$$'   # NB: single quotes
//!   $env:RITHMIC_GATEWAY  = "wss://rprotocol.rithmic.com:443"   # optional
//!   $env:RITHMIC_SYSTEM   = "Apex"                              # optional
//!   $env:RITHMIC_SYMBOL   = "MNQM6"                             # optional
//!   $env:RITHMIC_EXCHANGE = "CME"                               # optional
//!   cargo run --example rithmic_apex
//!
//! The example runs three phases on three separate WebSocket
//! connections, since the gateway closes the socket if SystemInfo
//! and Login are issued on the same connection (Phase 7.4 finding):
//!
//!   1. SystemInfo probe — connect, list available systems, close.
//!      Tells us the canonical system_name to use.
//!   2. Login probe      — connect, login with the configured
//!      system_name, log + close. Confirms creds are accepted.
//!   3. Stream probe     — connect, login, subscribe MNQM6.CME for
//!      60 seconds, log every LastTrade as it arrives. The trade
//!      density is the diagnostic — UAT serves ~0.3 trades/sec
//!      during cash hours (Phase 7.7.3 investigation), real prod
//!      should be 50–200/sec on MNQ during US RTH.

use std::time::{Duration, Instant};

use desktop_lib::connectors::adapter::{Credentials, MarketDataAdapter};
use desktop_lib::connectors::rithmic::client::RithmicClient;
use desktop_lib::connectors::rithmic::proto::{
    RequestRithmicSystemInfo, ResponseRithmicSystemInfo,
};
use desktop_lib::connectors::rithmic::RithmicAdapter;
use desktop_lib::connectors::tick::Side;

const APP_NAME: &str = "OrderflowV2-ApexProbe";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_GATEWAY: &str = "wss://rprotocol.rithmic.com:443";
const DEFAULT_SYSTEM: &str = "Apex";
const DEFAULT_SYMBOL: &str = "MNQM6";
const DEFAULT_EXCHANGE: &str = "CME";
const STREAM_DURATION: Duration = Duration::from_secs(60);

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let username =
        std::env::var("RITHMIC_USER").map_err(|_| "RITHMIC_USER env var not set")?;
    let password = std::env::var("RITHMIC_PASSWORD")
        .map_err(|_| "RITHMIC_PASSWORD env var not set")?;
    let gateway =
        std::env::var("RITHMIC_GATEWAY").unwrap_or_else(|_| DEFAULT_GATEWAY.to_string());
    let system =
        std::env::var("RITHMIC_SYSTEM").unwrap_or_else(|_| DEFAULT_SYSTEM.to_string());
    let symbol =
        std::env::var("RITHMIC_SYMBOL").unwrap_or_else(|_| DEFAULT_SYMBOL.to_string());
    let exchange =
        std::env::var("RITHMIC_EXCHANGE").unwrap_or_else(|_| DEFAULT_EXCHANGE.to_string());

    println!(
        "\n=== Phase 7.9 probe ===\n  gateway:  {gateway}\n  system:   {system}\n  user:     {username}\n  symbol:   {symbol}.{exchange}\n"
    );

    // ─────────── Phase 1 — SystemInfo ───────────────────────────────
    println!("[1/3] SystemInfo probe…");
    match probe_system_info(&gateway).await {
        Ok(systems) => {
            println!("      Available systems on {gateway}:");
            for s in &systems {
                let mark = if *s == system { " ← target" } else { "" };
                println!("        - {s}{mark}");
            }
            if !systems.iter().any(|s| s == &system) {
                eprintln!(
                    "      ⚠ Configured system '{system}' is not in the list — \
                     login is likely to fail."
                );
            }
        }
        Err(e) => {
            eprintln!("      ✗ SystemInfo failed: {e}");
            eprintln!(
                "      Cannot continue — the gateway probably isn't reachable \
                 with these credentials. Try a different RITHMIC_GATEWAY."
            );
            return Err(e);
        }
    }
    println!();

    // ─────────── Phase 2 — Login probe ──────────────────────────────
    println!("[2/3] Login probe…");
    let creds = Credentials {
        username,
        password,
        system_name: system.clone(),
        gateway_url: gateway.clone(),
        app_name: APP_NAME.to_string(),
        app_version: APP_VERSION.to_string(),
    };

    let mut adapter = RithmicAdapter::new();
    if let Err(e) = adapter.open_socket_with(&gateway).await {
        eprintln!("      ✗ Cannot open WebSocket: {e}");
        return Err(format!("connect failed: {e}").into());
    }
    if let Err(e) = adapter.login(&creds).await {
        eprintln!("      ✗ Login failed: {e}");
        let _ = adapter.close().await;
        return Err(format!("login failed: {e}").into());
    }
    if let Some(s) = adapter.session() {
        println!(
            "      ✓ Login OK — fcm={} ib={} country={} heartbeat={}s",
            s.fcm_id, s.ib_id, s.country_code, s.heartbeat_interval_secs
        );
    }
    println!();

    // ─────────── Phase 3 — Stream probe ─────────────────────────────
    println!(
        "[3/3] Streaming {}.{} for {}s…",
        symbol,
        exchange,
        STREAM_DURATION.as_secs()
    );
    let mut tick_rx = adapter.ticks();
    if let Err(e) = adapter.subscribe(&symbol, &exchange).await {
        eprintln!("      ✗ Subscribe failed: {e}");
        let _ = adapter.disconnect().await;
        return Err(format!("subscribe failed: {e}").into());
    }

    let started = Instant::now();
    let mut count: u64 = 0;
    let mut buys: u64 = 0;
    let mut sells: u64 = 0;
    let mut total_qty: f64 = 0.0;

    while started.elapsed() < STREAM_DURATION {
        let remaining = STREAM_DURATION.saturating_sub(started.elapsed());
        match tokio::time::timeout(remaining.min(Duration::from_secs(5)), tick_rx.recv())
            .await
        {
            Ok(Ok(t)) => {
                count += 1;
                total_qty += t.qty;
                let label = match t.side {
                    Side::Buy => {
                        buys += 1;
                        "BUY "
                    }
                    Side::Sell => {
                        sells += 1;
                        "SELL"
                    }
                };
                if count <= 20 || count % 50 == 0 {
                    println!(
                        "      [#{count:>5}] {label} {:<12} {:>9.2} qty={:>4.0}",
                        t.symbol, t.price, t.qty
                    );
                }
            }
            Ok(Err(broadcast::error::RecvError::Lagged(n))) => {
                eprintln!("      (lagged {n} ticks — broadcast overflow)");
            }
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                eprintln!("      ✗ tick channel closed early");
                break;
            }
            Err(_) => {
                // idle window, keep going
            }
        }
    }

    println!("\n=== Stream summary ===");
    println!(
        "  duration:        {:.1}s",
        started.elapsed().as_secs_f64()
    );
    println!("  total trades:    {count}");
    println!(
        "  rate:            {:.2} trades/sec",
        count as f64 / started.elapsed().as_secs_f64()
    );
    println!("  total volume:    {total_qty:.0}");
    println!("  buy aggressors:  {buys}");
    println!("  sell aggressors: {sells}");
    if count > 0 {
        let pct_buy = 100.0 * buys as f64 / count as f64;
        println!("  buy/sell split:  {pct_buy:.0}% / {:.0}%", 100.0 - pct_buy);
    }

    // Reference: Phase 7.7.3 UAT investigation captured 11 trades in
    // ~54s during US cash hours = 0.2 trades/sec, 100% BUY. Anything
    // materially above that and with a non-degenerate side split is
    // real(-ish) live data.
    if count >= 50 {
        println!("\n  ✓ Looks live — high enough rate to rule out UAT.");
    } else if count > 0 {
        println!(
            "\n  ⚠ Only {count} trades in 60s — could still be off-hours \
                 OR throttled like UAT. Re-run during US RTH to compare."
        );
    } else {
        println!("\n  ⚠ No trades captured — market closed, wrong symbol, or no entitlement.");
    }

    let _ = adapter.unsubscribe(&symbol, &exchange).await;
    let _ = adapter.disconnect().await;
    Ok(())
}

/// Open a fresh WebSocket connection and run a SystemInfo handshake.
/// Returns the list of system names the gateway exposes for the IP /
/// account that connected.
async fn probe_system_info(
    gateway: &str,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut client = RithmicClient::new();
    client.connect(gateway).await?;
    let req = RequestRithmicSystemInfo {
        template_id: 16,
        user_msg: vec!["apex-probe".to_string()],
    };
    client.send(&req).await?;
    let resp: ResponseRithmicSystemInfo = client.recv().await?;
    let _ = client.close().await;

    if !resp.rp_code.iter().any(|c| c == "0") {
        return Err(format!(
            "system info rejected: rp_code={:?} user_msg={:?}",
            resp.rp_code, resp.user_msg
        )
        .into());
    }
    Ok(resp.system_name)
}

// Local re-export so the broadcast::error path resolves cleanly above.
use tokio::sync::broadcast;
