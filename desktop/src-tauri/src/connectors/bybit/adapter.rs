//! Bybit V5 (linear/USDT-perp) adapter implementing `MarketDataAdapter`.
//!
//! Lifecycle mirrors Binance plus an explicit application heartbeat
//! (`{"op":"ping"}` every 20s). Bybit kicks idle sockets after ~30s,
//! so the heartbeat task is part of the post-connect critical path.

use std::collections::HashSet;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::bybit::client::BybitClient;
use crate::connectors::bybit::heartbeat::{self, HeartbeatHandle};
use crate::connectors::bybit::reader;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const HEARTBEAT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

pub const DEFAULT_LINEAR_URL: &str = "wss://stream.bybit.com/v5/public/linear";
pub const DEFAULT_SPOT_URL: &str = "wss://stream.bybit.com/v5/public/spot";

pub struct BybitAdapter {
    client: BybitClient,
    url: String,
    tick_tx: broadcast::Sender<Tick>,
    reader_handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    heartbeat: Option<HeartbeatHandle>,
    subscriptions: HashSet<String>,
}

impl BybitAdapter {
    pub fn new() -> Self {
        Self::with_url(DEFAULT_LINEAR_URL.to_string())
    }

    pub fn with_url(url: String) -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: BybitClient::new(),
            url,
            tick_tx,
            reader_handle: None,
            shutdown_tx: None,
            heartbeat: None,
            subscriptions: HashSet::new(),
        }
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn subscriptions(&self) -> &HashSet<String> {
        &self.subscriptions
    }
}

impl Default for BybitAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MarketDataAdapter for BybitAdapter {
    async fn connect(&mut self) -> Result<()> {
        if self.client.is_connected() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        tracing::info!("Connecting to Bybit at {}", self.url);
        self.client.connect(&self.url).await?;
        let (stream, sink) = self.client.into_split()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = reader::spawn(stream, sink.clone(), self.tick_tx.clone(), shutdown_rx);
        self.reader_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
        self.heartbeat = Some(heartbeat::spawn(sink, heartbeat::DEFAULT_INTERVAL));
        Ok(())
    }

    async fn subscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        let topic = format!("publicTrade.{}", symbol.to_uppercase());
        let req = json!({
            "op": "subscribe",
            "args": [topic],
        });
        tracing::info!("Subscribing to Bybit {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.insert(symbol.to_uppercase());
        Ok(())
    }

    async fn unsubscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        let topic = format!("publicTrade.{}", symbol.to_uppercase());
        let req = json!({
            "op": "unsubscribe",
            "args": [topic],
        });
        tracing::info!("Unsubscribing from Bybit {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.remove(&symbol.to_uppercase());
        Ok(())
    }

    fn ticks(&self) -> broadcast::Receiver<Tick> {
        self.tick_tx.subscribe()
    }

    async fn disconnect(&mut self) -> Result<()> {
        if let Some(hb) = self.heartbeat.take() {
            let _ = hb.shutdown.send(());
            let _ = tokio::time::timeout(HEARTBEAT_SHUTDOWN_TIMEOUT, hb.handle).await;
        }
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.reader_handle.take() {
            let _ = tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, handle).await;
        }
        self.subscriptions.clear();
        self.client.close().await?;
        tracing::info!("Bybit disconnected");
        Ok(())
    }
}
