//! Bridge adapter implementing `MarketDataAdapter`.
//!
//! Consumes the CSV-line wire protocol served by the NinjaTrader
//! `OrderflowBridge` indicator over TCP loopback. The bridge fixes
//! the streamed symbol (decided by the chart NT runs the indicator
//! on), so `subscribe()` / `unsubscribe()` are no-ops on this side.
//!
//! `login()` keeps the trait's no-op default — the bridge listens on
//! 127.0.0.1 only and has no authentication.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::bridge::client::BridgeConfig;
use crate::connectors::bridge::parser::DepthUpdate;
use crate::connectors::bridge::reader::{self, BridgeConnState};
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::tick::Tick;
use crate::engine::FootprintEngine;

/// Sized to absorb a full historical replay burst without dropping
/// ticks. The NinjaScript dumps 700k–2M historical ticks in ~2-5
/// seconds (loopback throughput ≈ 375k lines/sec) while the engine
/// pump processes ~100-300k ticks/sec — without headroom the
/// broadcast channel overflows and silently evicts oldest items,
/// producing chronically thin footprint bars (the symptom seen on
/// 2026-05-26: vol 142 instead of vol 1500+/minute on MNQ).
/// Memory peak: ~140 MB during burst, drained back to near-zero
/// once the engine catches up.
const TICK_CHANNEL_CAPACITY: usize = 1_000_000;
const STATE_CHANNEL_CAPACITY: usize = 64;
/// L2 depth bursts can hit thousands of events per second on illiquid
/// open / close moments. Sized like ticks (vs state) to absorb a fast
/// market-on-open burst without forcing the IPC emitter to lag.
const DEPTH_CHANNEL_CAPACITY: usize = 16_384;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

pub struct BridgeAdapter {
    config: BridgeConfig,
    tick_tx: broadcast::Sender<Tick>,
    state_tx: broadcast::Sender<BridgeConnState>,
    depth_tx: broadcast::Sender<(String, DepthUpdate)>,
    reader_handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    /// Shared footprint engine — handed to the reader task so it can
    /// register the per-symbol tick size on the M-header before any
    /// tick is processed.
    engine: Arc<FootprintEngine>,
}

impl BridgeAdapter {
    pub fn with_config(config: BridgeConfig, engine: Arc<FootprintEngine>) -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        let (state_tx, _) = broadcast::channel(STATE_CHANNEL_CAPACITY);
        let (depth_tx, _) = broadcast::channel(DEPTH_CHANNEL_CAPACITY);
        Self {
            config,
            tick_tx,
            state_tx,
            depth_tx,
            reader_handle: None,
            shutdown_tx: None,
            engine,
        }
    }

    pub fn config(&self) -> &BridgeConfig {
        &self.config
    }

    /// Subscribe to state updates (Connecting / ReceivingHistory / Live / Reconnecting).
    pub fn states(&self) -> broadcast::Receiver<BridgeConnState> {
        self.state_tx.subscribe()
    }

    /// Subscribe to raw L2 depth updates straight from the bridge.
    /// Consumers should coalesce on a per-frame window before emitting
    /// to the UI — a fast market can produce > 1000 events/sec.
    pub fn depths(&self) -> broadcast::Receiver<(String, DepthUpdate)> {
        self.depth_tx.subscribe()
    }

    /// Long-lived clone of the depth sender — handed to the spawn
    /// flow so the IPC emitter can resubscribe after an adapter
    /// restart without losing its event channel.
    pub fn depth_sender(&self) -> broadcast::Sender<(String, DepthUpdate)> {
        self.depth_tx.clone()
    }

    pub fn is_connected(&self) -> bool {
        self.reader_handle.is_some()
    }
}

#[async_trait]
impl MarketDataAdapter for BridgeAdapter {
    async fn connect(&mut self) -> Result<()> {
        if self.reader_handle.is_some() {
            return Err(ConnectorError::Other("bridge already connected".into()));
        }
        tracing::info!(addr = %self.config.addr(), "Bridge: starting reader task");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let handle = reader::spawn(
            self.config.clone(),
            self.tick_tx.clone(),
            self.state_tx.clone(),
            self.depth_tx.clone(),
            shutdown_rx,
            self.engine.clone(),
        );
        self.reader_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
        Ok(())
    }

    /// No-op: the streamed symbol is fixed by the NinjaTrader chart.
    /// We accept the call to satisfy the trait and log it for observability.
    async fn subscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        tracing::debug!(
            symbol,
            "Bridge: subscribe is a no-op (symbol is set by NinjaTrader chart)"
        );
        Ok(())
    }

    async fn unsubscribe(&mut self, symbol: &str, _exchange: &str) -> Result<()> {
        tracing::debug!(symbol, "Bridge: unsubscribe is a no-op");
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
                Ok(Ok(())) => tracing::info!("Bridge reader ended cleanly"),
                Ok(Err(e)) => tracing::warn!("Bridge reader panicked: {}", e),
                Err(_) => tracing::warn!(
                    "Bridge reader did not exit within {:?} — abandoning",
                    READER_SHUTDOWN_TIMEOUT
                ),
            }
        }
        tracing::info!("Bridge disconnected");
        Ok(())
    }
}
