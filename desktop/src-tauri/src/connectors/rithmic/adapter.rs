use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::connectors::adapter::{Credentials, MarketDataAdapter};
use crate::connectors::error::Result;
use crate::connectors::rithmic::client::RithmicClient;
use crate::connectors::tick::Tick;

const TICK_CHANNEL_CAPACITY: usize = 4096;

pub struct RithmicAdapter {
    tick_tx: broadcast::Sender<Tick>,
    #[allow(dead_code)] // Phase 7.3+ will own the WebSocket connection here
    client: RithmicClient,
}

impl RithmicAdapter {
    pub fn new() -> Self {
        let (tick_tx, _) = broadcast::channel(TICK_CHANNEL_CAPACITY);
        Self {
            tick_tx,
            client: RithmicClient::new(),
        }
    }
}

impl Default for RithmicAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MarketDataAdapter for RithmicAdapter {
    async fn connect(&mut self) -> Result<()> {
        todo!("Phase 7.3 — WebSocket TLS connect + RequestRithmicSystemInfo")
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
