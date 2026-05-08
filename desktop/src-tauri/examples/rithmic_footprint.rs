//! Phase 7.7.1 smoke test — drive the FootprintEngine off the Rithmic
//! tick stream and print live bars every few seconds.
//!
//! Usage (PowerShell):
//!   $env:RITHMIC_TEST_USER     = "ryad.bouderga78@gmail.com"
//!   $env:RITHMIC_TEST_PASSWORD = "..."
//!   cargo run --example rithmic_footprint

use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::TimeZone;
use desktop_lib::connectors::adapter::{Credentials, MarketDataAdapter};
use desktop_lib::connectors::rithmic::RithmicAdapter;
use desktop_lib::engine::{FootprintEngine, Timeframe};

const APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SYSTEM_NAME: &str = "Rithmic Test";
const RUN_DURATION: Duration = Duration::from_secs(60);
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(10);
const MNQ_TICK_SIZE: f64 = 0.25;
const TOP_LEVELS_PER_BAR: usize = 5;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let username = std::env::var("RITHMIC_TEST_USER")
        .map_err(|_| "RITHMIC_TEST_USER env var not set")?;
    let password = std::env::var("RITHMIC_TEST_PASSWORD")
        .map_err(|_| "RITHMIC_TEST_PASSWORD env var not set")?;
    let symbol =
        std::env::var("RITHMIC_SYMBOL").unwrap_or_else(|_| "MNQM6".to_string());
    let exchange =
        std::env::var("RITHMIC_EXCHANGE").unwrap_or_else(|_| "CME".to_string());

    let creds = Credentials {
        username,
        password,
        system_name: SYSTEM_NAME.to_string(),
        gateway_url: "wss://rituz00100.rithmic.com:443".to_string(),
        app_name: APP_NAME.to_string(),
        app_version: APP_VERSION.to_string(),
    };

    let mut adapter = RithmicAdapter::new();
    adapter.open_socket().await?;
    adapter.login(&creds).await?;

    // Footprint engine — multi-timeframe so we see how the buckets line up.
    let engine = Arc::new(FootprintEngine::new(
        vec![Timeframe::Sec5, Timeframe::Min1],
        MNQ_TICK_SIZE,
    ));
    let _engine_task = engine.clone().spawn(adapter.ticks());

    adapter.subscribe(&symbol, &exchange).await?;
    let symbol_full = format!("{}.{}", symbol, exchange);

    println!(
        "\n=== Streaming {} for {}s ===\n",
        symbol_full,
        RUN_DURATION.as_secs()
    );

    let start = Instant::now();
    let mut next_snapshot = start + SNAPSHOT_INTERVAL;
    while start.elapsed() < RUN_DURATION {
        let until_snapshot = next_snapshot.saturating_duration_since(Instant::now());
        let remaining = RUN_DURATION.saturating_sub(start.elapsed());
        tokio::time::sleep(until_snapshot.min(remaining)).await;

        if Instant::now() >= next_snapshot {
            print_snapshot(&engine, &symbol_full).await;
            next_snapshot += SNAPSHOT_INTERVAL;
        }
    }

    println!("\n=== Final snapshot ===");
    print_snapshot(&engine, &symbol_full).await;

    adapter.unsubscribe(&symbol, &exchange).await?;
    adapter.disconnect().await?;
    Ok(())
}

async fn print_snapshot(engine: &FootprintEngine, symbol: &str) {
    let sec5 = engine.get_bars(symbol, Timeframe::Sec5, 3).await;
    let min1 = engine.get_bars(symbol, Timeframe::Min1, 1).await;

    if sec5.is_empty() && min1.is_empty() {
        println!("(no ticks yet)\n");
        return;
    }

    println!("---");
    if !sec5.is_empty() {
        println!("Last {} bars [5s]:", sec5.len());
        for bar in &sec5 {
            print_bar(bar);
        }
    }
    if !min1.is_empty() {
        println!("Last {} bar(s) [1m]:", min1.len());
        for bar in &min1 {
            print_bar(bar);
        }
    }
    println!();
}

fn print_bar(bar: &desktop_lib::engine::FootprintBar) {
    let ts_secs = (bar.bucket_ts_ns / 1_000_000_000) as i64;
    let stamp = chrono::Utc
        .timestamp_opt(ts_secs, 0)
        .single()
        .map(|t| t.format("%H:%M:%S").to_string())
        .unwrap_or_else(|| "?".to_string());
    println!(
        "  [{}] [{}] OHLC {:.2}/{:.2}/{:.2}/{:.2}  vol={:>4.0}  Δ={:+5.0}  trades={:>3}  levels={}",
        stamp,
        bar.timeframe,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.total_volume,
        bar.total_delta,
        bar.trade_count,
        bar.levels.len(),
    );
    let mut sorted = bar.levels.clone();
    sorted.sort_by(|a, b| {
        b.total_volume()
            .partial_cmp(&a.total_volume())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for lvl in sorted.iter().take(TOP_LEVELS_PER_BAR) {
        println!(
            "       {:>10.2}  buy={:>4.0}  sell={:>4.0}  Δ={:+4.0}",
            lvl.price,
            lvl.buy_volume,
            lvl.sell_volume,
            lvl.delta(),
        );
    }
}
