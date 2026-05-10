//! Binance Futures (USDT-M) adapter implementing `MarketDataAdapter`.
//!
//! Lifecycle:
//!   connect()   → open WebSocket, split, spawn reader
//!   subscribe() → SUBSCRIBE message for `{symbol}@aggTrade`
//!   ticks()     → broadcast::Receiver<Tick>
//!   disconnect()→ stop reader + close socket
//!
//! `login()` is the no-op default from the trait (public feed).
//! Heartbeats are unnecessary: Binance pings every ~3 minutes and the
//! reader task replies with Pong, which is all the gateway requires.

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::binance::client::BinanceClient;
use crate::connectors::binance::reader;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

pub const DEFAULT_FUTURES_URL: &str = "wss://fstream.binance.com/ws";
pub const DEFAULT_SPOT_URL: &str = "wss://stream.binance.com:9443/ws";

/// Phase B / M2 ships with Spot as the default: Binance Futures
/// (`fstream.binance.com`) silently delivers no data to several
/// regions (EU/FR included) — the WS connection is accepted but the
/// aggTrade feed stays empty. Spot has identical message format and
/// no geo-restriction, so it's what `BinanceAdapter::new()` uses.
/// Callers who specifically need Futures (and have a working route)
/// can opt in via `with_url(DEFAULT_FUTURES_URL.into())`.

pub struct BinanceAdapter {
    client: BinanceClient,
    url: String,
    tick_tx: broadcast::Sender<Tick>,
    reader_handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    subscriptions: HashSet<String>,
    next_id: AtomicU64,
}

impl BinanceAdapter {
    pub fn new() -> Self {
        Self::with_url(DEFAULT_SPOT_URL.to_string())
    }

    pub fn with_url(url: String) -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            client: BinanceClient::new(),
            url,
            tick_tx,
            reader_handle: None,
            shutdown_tx: None,
            subscriptions: HashSet::new(),
            next_id: AtomicU64::new(1),
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

impl Default for BinanceAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MarketDataAdapter for BinanceAdapter {
    async fn connect(&mut self) -> Result<()> {
        if self.client.is_connected() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        tracing::info!("Connecting to Binance at {}", self.url);
        self.client.connect(&self.url).await?;
        let (stream, sink) = self.client.into_split()?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = reader::spawn(stream, sink, self.tick_tx.clone(), shutdown_rx);
        self.reader_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
        Ok(())
    }

    /// `exchange` is ignored: Binance routes everything through one
    /// venue per WebSocket. We accept the parameter to satisfy the
    /// trait but treat the symbol alone as the subscription key.
    async fn subscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        let stream_name = format!("{}@aggTrade", symbol.to_lowercase());
        let req = json!({
            "method": "SUBSCRIBE",
            "params": [stream_name],
            "id": self.next_id(),
        });
        tracing::info!("Subscribing to Binance {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.insert(symbol.to_uppercase());
        Ok(())
    }

    async fn unsubscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        if !self.client.is_connected() {
            return Err(ConnectorError::NotConnected);
        }
        let stream_name = format!("{}@aggTrade", symbol.to_lowercase());
        let req = json!({
            "method": "UNSUBSCRIBE",
            "params": [stream_name],
            "id": self.next_id(),
        });
        tracing::info!("Unsubscribing from Binance {}", symbol);
        self.client.send_text(serde_json::to_string(&req)?).await?;
        self.subscriptions.remove(&symbol.to_uppercase());
        Ok(())
    }

    fn ticks(&self) -> broadcast::Receiver<Tick> {
        self.tick_tx.subscribe()
    }

    async fn disconnect(&mut self) -> Result<()> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.reader_handle.take() {
            match tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, handle).await {
                Ok(Ok(())) => tracing::info!("Binance reader ended cleanly"),
                Ok(Err(e)) => tracing::warn!("Binance reader panicked: {}", e),
                Err(_) => tracing::warn!(
                    "Binance reader did not exit within {:?} — abandoning",
                    READER_SHUTDOWN_TIMEOUT
                ),
            }
        }
        self.subscriptions.clear();
        self.client.close().await?;
        tracing::info!("Binance disconnected");
        Ok(())
    }
}
