//! Standalone smoke test for Phase 7.3 — connects to the Rithmic Test
//! gateway, performs the system-info handshake, prints the available
//! systems and disconnects.
//!
//! Run with: `cargo run --example rithmic_connect`

use desktop_lib::connectors::adapter::MarketDataAdapter;
use desktop_lib::connectors::rithmic::RithmicAdapter;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let mut adapter = RithmicAdapter::new();
    adapter.connect().await?;

    println!("\n=== Connection successful ===");
    println!("Available systems:");
    for system in adapter.available_systems() {
        println!("  - {}", system);
    }

    adapter.close().await?;
    println!("\nDisconnected cleanly.");
    Ok(())
}
