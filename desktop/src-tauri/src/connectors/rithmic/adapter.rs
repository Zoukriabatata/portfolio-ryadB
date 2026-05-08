use async_trait::async_trait;
use std::time::Duration;
use tokio::sync::broadcast;

use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::auth::RithmicSession;
use crate::connectors::rithmic::client::RithmicClient;
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, RequestLogin, RequestLogout, RequestRithmicSystemInfo,
    ResponseLogin, ResponseLogout, ResponseRithmicSystemInfo,
};
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;

/// Default Rithmic Test gateway. Production environments use a different
/// host (e.g. `wss://rprotocol-mt.rithmic.com:443` for Rithmic 01) — this
/// constant is the development default and can be overridden later via
/// connect_with(url).
pub const DEFAULT_GATEWAY_URL: &str = "wss://rituz00100.rithmic.com:443";

/// Wire-protocol revision string Rithmic expects in RequestLogin. Matches
/// the value used in the official SDK's SampleMD.js (SDK v0.89.0.0).
const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";

/// How long disconnect() will wait for the gateway's ResponseLogout
/// before forcing the WebSocket closed.
const LOGOUT_RECV_TIMEOUT: Duration = Duration::from_secs(5);

/// Template IDs we exchange in Phase 7.3–7.4. The full table lives in
/// the Reference Guide; defining only what we use keeps the surface
/// honest.
mod template {
    pub const REQUEST_RITHMIC_SYSTEM_INFO: i32 = 16;
    pub const RESPONSE_RITHMIC_SYSTEM_INFO: i32 = 17;
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;
    pub const RESPONSE_LOGOUT: i32 = 13;
}

pub struct RithmicAdapter {
    client: RithmicClient,
    available_systems: Vec<String>,
    session: Option<RithmicSession>,
    tick_tx: broadcast::Sender<Tick>,
}

impl RithmicAdapter {
    pub fn new() -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: RithmicClient::new(),
            available_systems: Vec::new(),
            session: None,
            tick_tx,
        }
    }

    /// List of Rithmic system names returned by the most recent
    /// connect() handshake. Empty until connect() succeeds.
    pub fn available_systems(&self) -> &[String] {
        &self.available_systems
    }

    /// Authenticated session info populated by login(). `None` until
    /// login succeeds.
    pub fn session(&self) -> Option<&RithmicSession> {
        self.session.as_ref()
    }

    /// Low-level WebSocket close that bypasses the logout handshake.
    /// Useful for early-phase tests that never log in. For real teardown
    /// after login, prefer `disconnect()` which sends RequestLogout
    /// first.
    pub async fn close(&mut self) -> Result<()> {
        self.client.close().await
    }

    /// Open the WebSocket without performing the system-info handshake.
    /// Empirically the Rithmic gateway will NOT accept a RequestLogin on
    /// the same connection where it has already answered a
    /// RequestRithmicSystemInfo — it silently closes the socket. The
    /// official SampleMD.js mirrors this: it does either listSystems()
    /// XOR rithmicLogin() on a given WebSocket, never both. Use this
    /// method when the next call will be `login()`.
    pub async fn open_socket(&mut self) -> Result<()> {
        tracing::info!("Connecting to {}", DEFAULT_GATEWAY_URL);
        self.client.connect(DEFAULT_GATEWAY_URL).await?;
        tracing::info!("WebSocket connected");
        Ok(())
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

    /// Authenticate against TICKER_PLANT for the given system name.
    /// Must be called after connect(). On success, populates `session()`.
    async fn login(&mut self, credentials: &Credentials) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        if self.session.is_some() {
            return Err(ConnectorError::Other("already logged in".into()));
        }
        if !self.available_systems.is_empty()
            && !self.available_systems.contains(&credentials.system_name)
        {
            return Err(ConnectorError::AuthFailed(format!(
                "system '{}' not in available systems: {:?}",
                credentials.system_name, self.available_systems
            )));
        }

        // Field set mirrors the official SDK's SampleMD.js exactly.
        // We've burned a connection trying to send aggregated_quotes/
        // os_version/os_platform on the first login attempt and the
        // gateway closed the WebSocket without a response, so we now
        // ship only what the sample sends and add fields back later
        // if and when they're actually needed.
        let req = RequestLogin {
            template_id: template::REQUEST_LOGIN,
            template_version: Some(PROTOCOL_TEMPLATE_VERSION.to_string()),
            user_msg: vec!["hello".to_string()],
            user: Some(credentials.username.clone()),
            password: Some(credentials.password.clone()),
            app_name: Some(credentials.app_name.clone()),
            app_version: Some(credentials.app_version.clone()),
            system_name: Some(credentials.system_name.clone()),
            infra_type: Some(SysInfraType::TickerPlant as i32),
            mac_addr: vec![],
            os_version: None,
            os_platform: None,
            aggregated_quotes: None,
        };
        tracing::info!(
            "Sending RequestLogin (template {}) for system '{}' as user '{}'",
            template::REQUEST_LOGIN,
            credentials.system_name,
            credentials.username,
        );
        self.client.send(&req).await?;

        let resp: ResponseLogin = self.client.recv().await?;
        tracing::info!("Received ResponseLogin (template {})", resp.template_id);
        if resp.template_id != template::RESPONSE_LOGIN {
            return Err(ConnectorError::UnexpectedMessage(resp.template_id));
        }

        // rp_code is repeated: first element is the status code, the
        // remainder (if any) carry a human-readable reason.
        let primary = resp.rp_code.first().cloned().unwrap_or_default();
        if primary != "0" {
            let detail: Vec<String> = resp.rp_code.iter().skip(1).cloned().collect();
            return Err(ConnectorError::AuthFailed(format!(
                "rp_code={} detail={:?} user_msg={:?}",
                primary, detail, resp.user_msg
            )));
        }

        let session = RithmicSession {
            user: credentials.username.clone(),
            system_name: credentials.system_name.clone(),
            fcm_id: resp.fcm_id.unwrap_or_default(),
            ib_id: resp.ib_id.unwrap_or_default(),
            country_code: resp.country_code.unwrap_or_default(),
            state_code: resp.state_code.unwrap_or_default(),
            unique_user_id: resp.unique_user_id.unwrap_or_default(),
            heartbeat_interval_secs: resp.heartbeat_interval.unwrap_or(60.0),
        };

        tracing::info!(
            "Login successful: user={} fcm={} ib={} country={} heartbeat={}s",
            session.user,
            session.fcm_id,
            session.ib_id,
            session.country_code,
            session.heartbeat_interval_secs,
        );

        self.session = Some(session);
        Ok(())
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

    /// If logged in, send RequestLogout and best-effort wait for the
    /// matching response (5s timeout) before closing the WebSocket.
    /// Always closes the socket and clears local state, even if the
    /// logout handshake fails.
    async fn disconnect(&mut self) -> Result<()> {
        if self.session.is_some() {
            let req = RequestLogout {
                template_id: template::REQUEST_LOGOUT,
                user_msg: vec![],
            };
            tracing::info!(
                "Sending RequestLogout (template {})",
                template::REQUEST_LOGOUT
            );
            if let Err(e) = self.client.send(&req).await {
                tracing::warn!("Failed to send logout: {}", e);
            } else {
                match tokio::time::timeout(
                    LOGOUT_RECV_TIMEOUT,
                    self.client.recv::<ResponseLogout>(),
                )
                .await
                {
                    Ok(Ok(resp)) => tracing::info!(
                        "Received ResponseLogout (template {})",
                        resp.template_id
                    ),
                    Ok(Err(e)) => tracing::warn!("Error receiving ResponseLogout: {}", e),
                    Err(_) => tracing::warn!(
                        "Timeout ({:?}) waiting for ResponseLogout — proceeding to close",
                        LOGOUT_RECV_TIMEOUT
                    ),
                }
            }
        }

        self.session = None;
        self.available_systems.clear();
        self.client.close().await?;
        tracing::info!("Disconnected cleanly");
        Ok(())
    }
}
