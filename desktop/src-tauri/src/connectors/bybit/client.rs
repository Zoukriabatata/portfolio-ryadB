//! Low-level WebSocket transport for Bybit V5 public streams.
//!
//! Same Disconnected → Whole → Split state machine as
//! `connectors::binance::client`; only the destination URL and
//! protocol payloads differ.

use std::sync::Arc;

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::connectors::error::{ConnectorError, Result};

pub type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub type WsSink = SplitSink<WsStream, Message>;
pub type WsRead = SplitStream<WsStream>;
pub type SharedSink = Arc<Mutex<WsSink>>;

enum Inner {
    Disconnected,
    Whole(WsStream),
    Split(SharedSink),
}

pub struct BybitClient {
    inner: Inner,
}

impl BybitClient {
    pub fn new() -> Self {
        Self {
            inner: Inner::Disconnected,
        }
    }

    pub fn is_connected(&self) -> bool {
        !matches!(self.inner, Inner::Disconnected)
    }

    pub async fn connect(&mut self, url: &str) -> Result<()> {
        if self.is_connected() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        let (ws, _resp) = connect_async(url).await?;
        self.inner = Inner::Whole(ws);
        Ok(())
    }

    pub async fn send_text(&mut self, text: String) -> Result<()> {
        match &mut self.inner {
            Inner::Whole(ws) => ws.send(Message::Text(text)).await?,
            Inner::Split(sink) => {
                let mut s = sink.lock().await;
                s.send(Message::Text(text)).await?;
            }
            Inner::Disconnected => return Err(ConnectorError::NotConnected),
        }
        Ok(())
    }

    pub fn into_split(&mut self) -> Result<(WsRead, SharedSink)> {
        match std::mem::replace(&mut self.inner, Inner::Disconnected) {
            Inner::Whole(ws) => {
                let (sink, stream) = ws.split();
                let shared = Arc::new(Mutex::new(sink));
                self.inner = Inner::Split(Arc::clone(&shared));
                Ok((stream, shared))
            }
            other => {
                self.inner = other;
                Err(ConnectorError::Other(
                    "client not in Whole state — cannot split".into(),
                ))
            }
        }
    }

    pub async fn close(&mut self) -> Result<()> {
        match std::mem::replace(&mut self.inner, Inner::Disconnected) {
            Inner::Whole(mut ws) => {
                ws.close(None).await?;
            }
            Inner::Split(sink) => {
                let mut s = sink.lock().await;
                let _ = s.close().await;
            }
            Inner::Disconnected => {}
        }
        Ok(())
    }
}

impl Default for BybitClient {
    fn default() -> Self {
        Self::new()
    }
}
