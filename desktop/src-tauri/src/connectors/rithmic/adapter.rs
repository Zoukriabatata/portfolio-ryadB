use std::collections::HashSet;
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::auth::RithmicSession;
use crate::connectors::rithmic::client::RithmicClient;
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType,
    request_market_data_update::{Request as MarketDataRequest, UpdateBits},
    RequestLogin, RequestLogout, RequestMarketDataUpdate, RequestRithmicSystemInfo,
    ResponseLogin, ResponseRithmicSystemInfo,
};
use crate::connectors::rithmic::reader;
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;

/// Default Rithmic Test gateway. Production environments use a different
/// host (e.g. `wss://rprotocol-mt.rithmic.com:443` for Rithmic 01) — this
/// constant is the development default.
pub const DEFAULT_GATEWAY_URL: &str = "wss://rituz00100.rithmic.com:443";

/// Wire-protocol revision string Rithmic expects in RequestLogin. Matches
/// the value used in the official SDK's SampleMD.js (SDK v0.89.0.0).
const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";

/// How long disconnect() will wait for the reader task to drain
/// after we issue logout, before we forcibly tear the socket down.
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

/// Template IDs we exchange in Phase 7.3–7.5. The full table lives in
/// the Reference Guide; defining only what we use keeps the surface
/// honest.
mod template {
    pub const REQUEST_RITHMIC_SYSTEM_INFO: i32 = 16;
    pub const RESPONSE_RITHMIC_SYSTEM_INFO: i32 = 17;
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;
    pub const REQUEST_MARKET_DATA_UPDATE: i32 = 100;
}

pub struct RithmicAdapter {
    client: RithmicClient,
    available_systems: Vec<String>,
    session: Option<RithmicSession>,
    tick_tx: broadcast::Sender<Tick>,

    // Phase 7.5 — background reader task lifecycle. Populated by
    // `login()` (which splits the socket and spawns the task) and
    // torn down by `disconnect()`.
    reader_handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    subscriptions: HashSet<(String, String)>,
}

impl RithmicAdapter {
    pub fn new() -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: RithmicClient::new(),
            available_systems: Vec::new(),
            session: None,
            tick_tx,
            reader_handle: None,
            shutdown_tx: None,
            subscriptions: HashSet::new(),
        }
    }

    /// List of Rithmic system names returned by the most recent
    /// `connect()` (system-info) handshake. Empty if `open_socket()`
    /// was used or `connect()` never ran.
    pub fn available_systems(&self) -> &[String] {
        &self.available_systems
    }

    /// Authenticated session info populated by login(). `None` until
    /// login succeeds.
    pub fn session(&self) -> Option<&RithmicSession> {
        self.session.as_ref()
    }

    /// Currently active subscriptions as (symbol, exchange) pairs.
    pub fn subscriptions(&self) -> &HashSet<(String, String)> {
        &self.subscriptions
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
    /// Open the WebSocket and complete the system-info handshake. Use
    /// this only for system discovery — the gateway will refuse a
    /// subsequent login on the same connection. For login flows, use
    /// `open_socket()` instead.
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
    /// Must be called after `open_socket()` (or `connect()`, though
    /// the gateway will reject the latter sequence). On success,
    /// splits the WebSocket and spawns the background reader task.
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
        // Any extra optional fields (os_version, os_platform,
        // aggregated_quotes) cause the gateway to silently close
        // the socket on first attempt.
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

        // Split the connection and hand the read half off to the
        // background reader task. Subscribe acks, ticks, and BBO
        // updates will all arrive through it.
        let (stream, sink) = self.client.into_split()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = reader::spawn(stream, sink, self.tick_tx.clone(), shutdown_rx);
        self.reader_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);

        Ok(())
    }

    /// Subscribe to LAST_TRADE + BBO updates for `symbol` on
    /// `exchange`. The subscription ack arrives asynchronously through
    /// the reader task; this method only sends the request and tracks
    /// the pair locally so we know what to unsubscribe at teardown.
    async fn subscribe(&mut self, symbol: &str, exchange: &str) -> Result<()> {
        if self.session.is_none() {
            return Err(ConnectorError::Other(
                "must login before subscribe".into(),
            ));
        }
        let req = RequestMarketDataUpdate {
            template_id: template::REQUEST_MARKET_DATA_UPDATE,
            user_msg: vec![],
            symbol: Some(symbol.to_string()),
            exchange: Some(exchange.to_string()),
            request: Some(MarketDataRequest::Subscribe as i32),
            update_bits: Some((UpdateBits::LastTrade as u32) | (UpdateBits::Bbo as u32)),
        };
        tracing::info!(
            "Subscribing to {}.{} (LAST_TRADE | BBO)",
            symbol,
            exchange
        );
        self.client.send(&req).await?;
        self.subscriptions
            .insert((symbol.to_string(), exchange.to_string()));
        Ok(())
    }

    async fn unsubscribe(&mut self, symbol: &str, exchange: &str) -> Result<()> {
        if self.session.is_none() {
            return Err(ConnectorError::Other(
                "must login before unsubscribe".into(),
            ));
        }
        let req = RequestMarketDataUpdate {
            template_id: template::REQUEST_MARKET_DATA_UPDATE,
            user_msg: vec![],
            symbol: Some(symbol.to_string()),
            exchange: Some(exchange.to_string()),
            request: Some(MarketDataRequest::Unsubscribe as i32),
            update_bits: Some((UpdateBits::LastTrade as u32) | (UpdateBits::Bbo as u32)),
        };
        tracing::info!("Unsubscribing from {}.{}", symbol, exchange);
        self.client.send(&req).await?;
        self.subscriptions
            .remove(&(symbol.to_string(), exchange.to_string()));
        Ok(())
    }

    fn ticks(&self) -> broadcast::Receiver<Tick> {
        self.tick_tx.subscribe()
    }

    /// Graceful shutdown:
    ///   1. unsubscribe everything we know about
    ///   2. send RequestLogout
    ///   3. signal reader task to exit (it will also exit on its own
    ///      once the server closes after acking the logout)
    ///   4. await the reader task with a bounded timeout
    ///   5. close the WebSocket
    ///
    /// Always tears down local state even if any step fails — leaving
    /// the adapter in a half-connected state would be worse than
    /// dropping the connection.
    async fn disconnect(&mut self) -> Result<()> {
        let subs: Vec<(String, String)> = self.subscriptions.iter().cloned().collect();
        for (sym, ex) in subs {
            if let Err(e) = self.unsubscribe(&sym, &ex).await {
                tracing::warn!("Failed to unsubscribe {}.{}: {}", sym, ex, e);
            }
        }

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
            }
        }

        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.reader_handle.take() {
            match tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, handle).await {
                Ok(Ok(())) => tracing::info!("Reader task ended cleanly"),
                Ok(Err(e)) => tracing::warn!("Reader task panicked: {}", e),
                Err(_) => tracing::warn!(
                    "Reader task did not exit within {:?} — abandoning",
                    READER_SHUTDOWN_TIMEOUT
                ),
            }
        }

        self.session = None;
        self.available_systems.clear();
        self.subscriptions.clear();
        self.client.close().await?;
        tracing::info!("Disconnected cleanly");
        Ok(())
    }
}
