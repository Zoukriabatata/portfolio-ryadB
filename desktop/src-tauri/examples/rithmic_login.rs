//! Phase 7.4 smoke test — full connect → login → logout → disconnect
//! against the Rithmic Test gateway.
//!
//! Credentials are read from environment variables to keep them out
//! of the binary and out of git history:
//!
//!   $env:RITHMIC_TEST_USER     = "ryad.bouderga78@gmail.com"
//!   $env:RITHMIC_TEST_PASSWORD = "..."
//!   cargo run --example rithmic_login

use desktop_lib::connectors::adapter::{Credentials, MarketDataAdapter};
use desktop_lib::connectors::rithmic::RithmicAdapter;

const APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const SYSTEM_NAME: &str = "Rithmic Test";

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

    // The Rithmic gateway will not accept a RequestLogin on the same
    // socket where it has already answered a RequestRithmicSystemInfo,
    // so we skip the connect()/listSystems handshake here and open the
    // socket raw before logging in.
    adapter.open_socket().await?;
    adapter.login(&creds).await?;

    if let Some(session) = adapter.session() {
        println!("\n=== Login successful ===");
        println!("User:               {}", session.user);
        println!("System:             {}", session.system_name);
        println!("FCM:                {}", session.fcm_id);
        println!("IB:                 {}", session.ib_id);
        println!(
            "Country/State:      {} / {}",
            if session.country_code.is_empty() {
                "-"
            } else {
                &session.country_code
            },
            if session.state_code.is_empty() {
                "-"
            } else {
                &session.state_code
            },
        );
        println!("Unique user id:     {}", session.unique_user_id);
        println!(
            "Heartbeat interval: {}s",
            session.heartbeat_interval_secs
        );
    }

    // Hold the session briefly so the gateway has time to register us
    // before we send logout — otherwise we sometimes race the bind.
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    adapter.disconnect().await?;
    Ok(())
}
