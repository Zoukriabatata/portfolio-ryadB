use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::connectors::error::Result;
use crate::connectors::tick::Tick;

/// Common interface every market data connector implements.
///
/// Implementations are expected to be `&mut self`-driven for state
/// transitions (connect → login → subscribe → disconnect) and to fan
/// out received ticks via a broadcast channel — `ticks()` returns a
/// fresh `Receiver` per subscriber.
///
/// `login()` ships with a no-op default so public-data exchanges
/// (Binance/Bybit/Deribit, M2) can `impl MarketDataAdapter` without
/// pretending to authenticate. Brokered feeds (Rithmic) override it
/// to perform the real handshake.
#[async_trait]
pub trait MarketDataAdapter: Send + Sync {
    async fn connect(&mut self) -> Result<()>;
    async fn login(&mut self, _credentials: &Credentials) -> Result<()> {
        Ok(())
    }
    async fn subscribe(&mut self, symbol: &str, exchange: &str) -> Result<()>;
    async fn unsubscribe(&mut self, symbol: &str, exchange: &str) -> Result<()>;
    fn ticks(&self) -> broadcast::Receiver<Tick>;
    async fn disconnect(&mut self) -> Result<()>;
}

#[derive(Debug, Clone)]
pub struct Credentials {
    pub username: String,
    pub password: String,
    pub system_name: String,
    pub gateway_url: String,
    pub app_name: String,
    pub app_version: String,
}
