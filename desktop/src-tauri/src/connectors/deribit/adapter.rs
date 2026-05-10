//! Deribit V2 adapter implementing `MarketDataAdapter`.
//!
//! Subscribes to `trades.{instrument}.raw` channels via JSON-RPC.
//! Symbols are passed through as Deribit instrument names — e.g.
//! `BTC-PERPETUAL`, `ETH-PERPETUAL`, `SOL_USDC-PERPETUAL`. Heartbeat
//! task sends `public/test` every 30s to keep the socket alive.

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::deribit::client::DeribitClient;
use crate::connectors::deribit::heartbeat::{self, HeartbeatHandle};
use crate::connectors::deribit::reader;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const HEARTBEAT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

pub const DEFAULT_PROD_URL: &str = "wss://www.deribit.com/ws/api/v2";
pub const DEFAULT_TEST_URL: &str = "wss://test.deribit.com/ws/api/v2";

pub struct DeribitAdapter {
    client: DeribitClient,
    url: String,
    tick_tx: broadcast::Sender<Tick>,
    reader_handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    heartbeat: Option<HeartbeatHandle>,
    subscriptions: HashSet<String>,
    next_id: Arc<AtomicU64>,
}

impl DeribitAdapter {
    pub fn new() -> Self {
        Self::with_url(DEFAULT_PROD_URL.to_string())
    }

    pub fn with_url(url: String) -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: DeribitClient::new(),
            url,
            tick_tx,
            reader_handle: None,
            shutdown_tx: None,
            heartbeat: None,
            subscriptions: HashSet::new(),
            next_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn subscriptions(&self) -> &HashSet<String> {
        &self.subscriptions
    }

    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::SeqCst)
    }
}

impl Default for DeribitAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MarketDataAdapter for DeribitAdapter {
    async fn connect(&mut self) -> Result<()> {
        if self.client.is_connected() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        tracing::info!("Connecting to Deribit at {}", self.url);
        self.client.connect(&self.url).await?;
        let (stream, sink) = self.client.into_split()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = reader::spawn(stream, sink.clone(), self.tick_tx.clone(), shutdown_rx);
        self.reader_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
        self.heartbeat = Some(heartbeat::spawn(
            sink,
            heartbeat::DEFAULT_INTERVAL,
            Arc::clone(&self.next_id),
        ));
        Ok(())
    }

    /// `symbol` is the Deribit instrument name (e.g. "BTC-PERPETUAL").
    /// `exchange` is ignored — Deribit is single-venue per WebSocket.
    async fn subscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        // `.raw` requires auth (Deribit error 13778); `.100ms` is the
// equivalent public channel and ships every trade aggregated into
// 100ms windows — fine for footprint candles since our smallest
// timeframe (Sec5) is 50× coarser anyway.
let channel = format!("trades.{}.100ms", symbol);
        let req = json!({
            "jsonrpc": "2.0",
            "id": self.next_id(),
            "method": "public/subscribe",
            "params": { "channels": [channel] },
        });
        tracing::info!("Subscribing to Deribit {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.insert(symbol.to_string());
        Ok(())
    }

    async fn unsubscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        // `.raw` requires auth (Deribit error 13778); `.100ms` is the
// equivalent public channel and ships every trade aggregated into
// 100ms windows — fine for footprint candles since our smallest
// timeframe (Sec5) is 50× coarser anyway.
let channel = format!("trades.{}.100ms", symbol);
        let req = json!({
            "jsonrpc": "2.0",
            "id": self.next_id(),
            "method": "public/unsubscribe",
            "params": { "channels": [channel] },
        });
        tracing::info!("Unsubscribing from Deribit {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.remove(symbol);
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
        tracing::info!("Deribit disconnected");
        Ok(())
    }
}
