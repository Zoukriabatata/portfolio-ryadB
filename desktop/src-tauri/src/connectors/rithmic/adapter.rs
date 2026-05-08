use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::client::RithmicClient;
use crate::connectors::rithmic::proto::{
    RequestRithmicSystemInfo, ResponseRithmicSystemInfo,
};
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;

/// Default Rithmic Test gateway. Production environments use a different
/// host (e.g. `wss://rprotocol-mt.rithmic.com:443` for Rithmic 01) — this
/// constant is the development default and can be overridden later via
/// connect_with(url).
pub const DEFAULT_GATEWAY_URL: &str = "wss://rituz00100.rithmic.com:443";

/// Template IDs we exchange in Phase 7.3. The full table lives in the
/// Reference Guide; defining only what we use keeps the surface honest.
mod template {
    pub const REQUEST_RITHMIC_SYSTEM_INFO: i32 = 16;
    pub const RESPONSE_RITHMIC_SYSTEM_INFO: i32 = 17;
}

pub struct RithmicAdapter {
    client: RithmicClient,
    available_systems: Vec<String>,
    tick_tx: broadcast::Sender<Tick>,
}

impl RithmicAdapter {
    pub fn new() -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: RithmicClient::new(),
            available_systems: Vec::new(),
            tick_tx,
        }
    }

    /// List of Rithmic system names returned by the most recent
    /// connect() handshake. Empty until connect() succeeds.
    pub fn available_systems(&self) -> &[String] {
        &self.available_systems
    }

    /// Phase 7.3 helper: close the WebSocket without going through the
    /// full disconnect() flow (which still sends RequestLogout — N/A
    /// when we never logged in). Useful for early connect-only tests.
    pub async fn close(&mut self) -> Result<()> {
        self.client.close().await
    }
}

impl Default for RithmicAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MarketDataAdapter for RithmicAdapter {
    /// Open the WebSocket and complete the system-info handshake. On
    /// success the available system names are stored on the adapter
    /// (read via `available_systems()`).
    async fn connect(&mut self) -> Result<()> {
        tracing::info!("Connecting to {}", DEFAULT_GATEWAY_URL);
        self.client.connect(DEFAULT_GATEWAY_URL).await?;
        tracing::info!("WebSocket connected");

        let req = RequestRithmicSystemInfo {
            template_id: template::REQUEST_RITHMIC_SYSTEM_INFO,
            user_msg: vec!["orderflowv2_phase73".to_string()],
        };
        tracing::info!(
            "Sending RequestRithmicSystemInfo (template {})",
            template::REQUEST_RITHMIC_SYSTEM_INFO
        );
        self.client.send(&req).await?;

        let resp: ResponseRithmicSystemInfo = self.client.recv().await?;
        tracing::info!(
            "Received ResponseRithmicSystemInfo (template {})",
            resp.template_id
        );
        if resp.template_id != template::RESPONSE_RITHMIC_SYSTEM_INFO {
            return Err(ConnectorError::UnexpectedMessage(resp.template_id));
        }

        // rp_code "0" means success; anything else is an error from
        // the gateway with the reason in user_msg.
        if !resp.rp_code.iter().any(|c| c == "0") {
            return Err(ConnectorError::Other(format!(
                "system info rejected: rp_code={:?} user_msg={:?}",
                resp.rp_code, resp.user_msg
            )));
        }

        self.available_systems = resp.system_name;
        tracing::info!("Available systems: {:?}", self.available_systems);

        Ok(())
    }

    async fn login(&mut self, _credentials: &Credentials) -> Result<()> {
        todo!("Phase 7.4 — RequestLogin + parse ResponseLogin (heartbeat_interval)")
    }

    async fn subscribe(&mut self, _symbol: &str, _exchange: &str) -> Result<()> {
        todo!("Phase 7.5 — RequestMarketDataUpdate SUBSCRIBE + LastTrade/BBO parsing")
    }

    async fn unsubscribe(&mut self, _symbol: &str, _exchange: &str) -> Result<()> {
        todo!("Phase 7.5 — RequestMarketDataUpdate UNSUBSCRIBE")
    }

    fn ticks(&self) -> broadcast::Receiver<Tick> {
        self.tick_tx.subscribe()
    }

    async fn disconnect(&mut self) -> Result<()> {
        todo!("Phase 7.4 — RequestLogout + close WebSocket")
    }
}
