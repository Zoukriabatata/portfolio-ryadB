//! Broker configuration IPC commands.
//!
//! All credential-shaped values flow through here. The connection
//! commands (rithmic_login etc.) live in `commands/rithmic.rs` —
//! this module is purely about persistence + presets + a one-shot
//! credentials test.
//!
//! Naming: serde rename_all = "camelCase" on the input/output
//! structs so the React side speaks idiomatic JS without a manual
//! mapping layer.

use serde::Deserialize;

use crate::brokers::{
    self,
    credentials::{BrokerCredentials, BrokerCredentialsRedacted, BrokerPreset},
    presets::PresetInfo,
    vault,
};
use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::rithmic::RithmicAdapter;

const APP_NAME: &str = "OrderflowV2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Args for `save_broker_credentials`. Mirrors `BrokerCredentials`
/// shape with camelCase. The frontend constructs this from its
/// settings form; once saved, the password never has to flow back
/// out.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBrokerCredentialsArgs {
    pub preset: BrokerPreset,
    pub gateway_url: String,
    pub system_name: String,
    pub username: String,
    pub password: String,
}

impl From<SaveBrokerCredentialsArgs> for BrokerCredentials {
    fn from(a: SaveBrokerCredentialsArgs) -> Self {
        BrokerCredentials {
            preset: a.preset,
            gateway_url: a.gateway_url,
            system_name: a.system_name,
            username: a.username,
            password: a.password,
        }
    }
}

/// Args for `test_broker_connection`. Same shape as the save args
/// but the values are NOT persisted — used so the user can validate
/// what they typed before committing it to the vault.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestBrokerConnectionArgs {
    /// Sent by the UI for completeness/symmetry with the save args.
    /// Not used for the connection itself — the gateway URL +
    /// system name + creds are what matter.
    #[allow(dead_code)]
    pub preset: BrokerPreset,
    pub gateway_url: String,
    pub system_name: String,
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub async fn list_broker_presets() -> Vec<PresetInfo> {
    brokers::all_presets()
}

#[tauri::command]
pub async fn save_broker_credentials(args: SaveBrokerCredentialsArgs) -> Result<(), String> {
    let creds: BrokerCredentials = args.into();
    tokio::task::spawn_blocking(move || vault::save(&creds))
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault save failed: {e}"))
}

#[tauri::command]
pub async fn load_broker_credentials() -> Result<Option<BrokerCredentialsRedacted>, String> {
    let loaded = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?;
    Ok(loaded.as_ref().map(BrokerCredentialsRedacted::from))
}

#[tauri::command]
pub async fn delete_broker_credentials() -> Result<(), String> {
    tokio::task::spawn_blocking(vault::delete)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault delete failed: {e}"))
}

/// Connect → login → logout cycle against the supplied credentials,
/// without touching the vault and without spawning any reader/
/// heartbeat task. Returns `Ok(())` on a clean rp_code=0 login;
/// otherwise an error string the frontend can surface.
#[tauri::command]
pub async fn test_broker_connection(args: TestBrokerConnectionArgs) -> Result<(), String> {
    let creds = Credentials {
        username: args.username,
        password: args.password,
        system_name: args.system_name,
        gateway_url: args.gateway_url,
        app_name: APP_NAME.to_string(),
        app_version: APP_VERSION.to_string(),
    };

    let mut adapter = RithmicAdapter::new();
    adapter
        .open_socket()
        .await
        .map_err(|e| format!("connect failed: {e}"))?;
    let result = adapter.login(&creds).await;
    // Always tear down — we don't want a half-alive UAT session
    // dangling because the user clicked "Test" and then closed the
    // panel. Errors during teardown are swallowed because the test
    // itself succeeded or failed already.
    let _ = adapter.disconnect().await;
    let _ = adapter.close().await;
    result.map_err(|e| format!("login failed: {e}"))
}
