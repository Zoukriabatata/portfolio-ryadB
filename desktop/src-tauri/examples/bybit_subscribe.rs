//! M2 smoke test — connects to Bybit V5 linear public stream and
//! prints every publicTrade event for 30 seconds.
//!
//! Usage (PowerShell):
//!   cargo run --example bybit_subscribe
//!
//! Optional overrides via env:
//!   $env:BYBIT_SYMBOL = "ETHUSDT"

use std::time::{Duration, Instant};

use desktop_lib::connectors::adapter::MarketDataAdapter;
use desktop_lib::connectors::bybit::BybitAdapter;
use desktop_lib::connectors::tick::Side;
use tokio::sync::broadcast;

const RUN_DURATION: Duration = Duration::from_secs(30);

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let symbol = std::env::var("BYBIT_SYMBOL").unwrap_or_else(|_| "BTCUSDT".to_string());

    let mut adapter = BybitAdapter::new();
    let mut tick_rx = adapter.ticks();
    adapter.connect().await?;
    adapter.subscribe(&symbol, "bybit").await?;

    println!(
        "\n=== Streaming Bybit {} for {}s ===\n",
        symbol,
        RUN_DURATION.as_secs()
    );

    let deadline = Instant::now() + RUN_DURATION;
    let mut tick_count: u64 = 0;
    let mut buy_count: u64 = 0;
    let mut sell_count: u64 = 0;
    let mut total_volume: f64 = 0.0;

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match tokio::time::timeout(remaining.min(Duration::from_secs(5)), tick_rx.recv()).await {
            Ok(Ok(tick)) => {
                tick_count += 1;
                total_volume += tick.qty;
                let side_label = match tick.side {
                    Side::Buy => {
                        buy_count += 1;
                        "BUY "
                    }
                    Side::Sell => {
                        sell_count += 1;
                        "SELL"
                    }
                };
                println!(
                    "[#{:>4}] {} {:<10} {:>12.2} qty={:>10.4}  ts={}",
                    tick_count, side_label, tick.symbol, tick.price, tick.qty, tick.timestamp_ns,
                );
            }
            Ok(Err(broadcast::error::RecvError::Lagged(n))) => {
                eprintln!("Tick channel lagged by {} messages", n);
            }
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                eprintln!("Tick channel closed");
                break;
            }
            Err(_) => {}
        }
    }

    println!("\n=== Stream summary ===");
    println!("Total ticks: {}", tick_count);
    println!("  Buy aggressors:  {}", buy_count);
    println!("  Sell aggressors: {}", sell_count);
    println!("  Total volume:    {:.4}", total_volume);

    adapter.unsubscribe(&symbol, "bybit").await?;
    adapter.disconnect().await?;
    Ok(())
}
