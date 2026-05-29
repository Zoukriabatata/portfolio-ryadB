//! Thin TCP client for connecting to the NinjaTrader OrderflowBridge.
//!
//! Encapsulates the connect attempt + exponential reconnect backoff.

use std::time::Duration;

use tokio::net::TcpStream;

use crate::connectors::error::{ConnectorError, Result};

#[derive(Debug, Clone)]
pub struct BridgeConfig {
    pub host: String,
    pub port: u16,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 7272,
        }
    }
}

impl BridgeConfig {
    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

/// One-shot TCP connect — no retries here; callers (the reader task)
/// own the reconnect policy via `ReconnectBackoff`.
pub async fn connect(config: &BridgeConfig) -> Result<TcpStream> {
    tracing::info!(addr = %config.addr(), "Bridge: connecting");
    let stream = TcpStream::connect(config.addr())
        .await
        .map_err(|e| ConnectorError::Other(format!("bridge TCP connect failed: {}", e)))?;
    // Disable Nagle for live tick latency (matches NinjaScript side).
    if let Err(e) = stream.set_nodelay(true) {
        tracing::warn!("Bridge: failed to set TCP_NODELAY: {}", e);
    }
    Ok(stream)
}

/// Exponential reconnect backoff: 1s → 2s → 5s → 10s → 30s (capped).
#[derive(Debug)]
pub struct ReconnectBackoff {
    schedule: &'static [u64], // delays in seconds
    idx: usize,
}

impl ReconnectBackoff {
    pub fn new() -> Self {
        Self {
            schedule: &[1, 2, 5, 10, 30],
            idx: 0,
        }
    }

    pub fn next_delay(&mut self) -> Duration {
        let secs = self.schedule[self.idx];
        if self.idx + 1 < self.schedule.len() {
            self.idx += 1;
        }
        Duration::from_secs(secs)
    }

    pub fn reset(&mut self) {
        self.idx = 0;
    }
}

impl Default for ReconnectBackoff {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_schedule() {
        let mut b = ReconnectBackoff::new();
        assert_eq!(b.next_delay().as_secs(), 1);
        assert_eq!(b.next_delay().as_secs(), 2);
        assert_eq!(b.next_delay().as_secs(), 5);
        assert_eq!(b.next_delay().as_secs(), 10);
        assert_eq!(b.next_delay().as_secs(), 30);
        // Caps at 30s
        assert_eq!(b.next_delay().as_secs(), 30);
        assert_eq!(b.next_delay().as_secs(), 30);
    }

    #[test]
    fn backoff_reset() {
        let mut b = ReconnectBackoff::new();
        b.next_delay();
        b.next_delay();
        b.reset();
        assert_eq!(b.next_delay().as_secs(), 1);
    }

    #[test]
    fn config_addr() {
        let c = BridgeConfig {
            host: "127.0.0.1".into(),
            port: 7272,
        };
        assert_eq!(c.addr(), "127.0.0.1:7272");
    }
}
