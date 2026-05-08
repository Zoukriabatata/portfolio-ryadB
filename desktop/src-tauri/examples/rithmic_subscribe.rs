//! Phase 7.5 smoke test — connects, logs in, subscribes to MNQ on CME,
//! prints every tick that flows for 30 seconds, then unsubscribes and
//! disconnects cleanly.
//!
//! Usage (PowerShell):
//!   $env:RITHMIC_TEST_USER     = "ryad.bouderga78@gmail.com"
//!   $env:RITHMIC_TEST_PASSWORD = "..."
//!   cargo run --example rithmic_subscribe
//!
//! Optional overrides via env:
//!   $env:RITHMIC_SYMBOL   = "MNQM6"
//!   $env:RITHMIC_EXCHANGE = "CME"

use std::time::{Duration, Instant};

use desktop_lib::connectors::adapter::{Credentials, MarketDataAdapter};
use desktop_lib::connectors::rithmic::RithmicAdapter;
use desktop_lib::connectors::tick::Side;

const APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SYSTEM_NAME: &str = "Rithmic Test";
const RUN_DURATION: Duration = Duration::from_secs(30);

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

    let mut tick_rx = adapter.ticks();
    adapter.subscribe(&symbol, &exchange).await?;

    println!(
        "\n=== Streaming {}.{} for {}s ===\n",
        symbol,
        exchange,
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
                    "[#{:>4}] {} {:<12} {:>10.2} qty={:>4.0}  ts={}",
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
            Err(_) => {
                // Idle window — keep waiting until the deadline.
            }
        }
    }

    println!("\n=== Stream summary ===");
    println!("Total ticks: {}", tick_count);
    println!("  Buy aggressors:  {}", buy_count);
    println!("  Sell aggressors: {}", sell_count);
    println!("  Total volume:    {:.0}", total_volume);

    adapter.unsubscribe(&symbol, &exchange).await?;
    adapter.disconnect().await?;
    Ok(())
}

// Local re-export so we can name the broadcast lag error inline above.
use tokio::sync::broadcast;
