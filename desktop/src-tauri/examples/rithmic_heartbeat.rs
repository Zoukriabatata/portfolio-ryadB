//! Phase 7.6 endurance test — log in, do nothing for 3 minutes, then
//! disconnect cleanly. Without the heartbeat task the Rithmic gateway
//! drops the connection roughly one heartbeat_interval after login
//! (~60–120s); with it, the WebSocket should survive indefinitely.
//!
//! Usage (PowerShell):
//!   $env:RITHMIC_TEST_USER     = "ryad.bouderga78@gmail.com"
//!   $env:RITHMIC_TEST_PASSWORD = "..."
//!   cargo run --example rithmic_heartbeat

use std::time::{Duration, Instant};

use desktop_lib::connectors::adapter::{Credentials, MarketDataAdapter};
use desktop_lib::connectors::rithmic::RithmicAdapter;

const APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SYSTEM_NAME: &str = "Rithmic Test";
const RUN_DURATION: Duration = Duration::from_secs(180);
const TICK_PRINT_EVERY: Duration = Duration::from_secs(15);

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

    let interval = adapter
        .session()
        .map(|s| s.heartbeat_interval_secs)
        .unwrap_or(60.0);

    println!(
        "\n=== Connected. Idling for {}s; heartbeat interval={}s ===",
        RUN_DURATION.as_secs(),
        interval,
    );
    println!("Without heartbeat the gateway would drop us within ~{}s.\n", (interval * 2.0) as u64);

    let start = Instant::now();
    let mut next_print = start + TICK_PRINT_EVERY;
    while start.elapsed() < RUN_DURATION {
        let now = Instant::now();
        let until_print = next_print.saturating_duration_since(now);
        let remaining = RUN_DURATION.saturating_sub(start.elapsed());
        tokio::time::sleep(until_print.min(remaining)).await;
        if Instant::now() >= next_print {
            println!("[{:>3}s] still connected", start.elapsed().as_secs());
            next_print += TICK_PRINT_EVERY;
        }
    }

    println!(
        "\n=== Survived {}s without subscribe — heartbeat works ===",
        RUN_DURATION.as_secs()
    );

    adapter.disconnect().await?;
    Ok(())
}
