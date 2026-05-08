//! Low-level Rithmic WebSocket transport.
//!
//! Each WebSocket binary frame is one protobuf-encoded message — no
//! length prefix, no envelope. Every Rithmic message carries a
//! `template_id: i32` (wire tag 154467) which identifies the type;
//! callers either decode directly into the expected type or peek the
//! template_id first and dispatch.
//!
//! State machine:
//!   - `Disconnected`: nothing wired up.
//!   - `Whole`: connected, single-task send/recv. This is the state
//!     during the synchronous handshakes (system info, login).
//!   - `Split`: stream half has been moved out (typically into a
//!     reader task). Sends still go through the sink half, which is
//!     wrapped in `Arc<Mutex<>>` so the reader task can also send
//!     (e.g. pong responses) while the main task issues commands.

use std::sync::Arc;

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::connectors::error::{ConnectorError, Result};

pub type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub type WsSink = SplitSink<WsStream, Message>;
pub type WsRead = SplitStream<WsStream>;
pub type SharedSink = Arc<Mutex<WsSink>>;

/// Probe struct used to read just the template_id from any frame
/// without committing to a concrete message type. Wire tag 154467
/// matches every real Rithmic message — unknown fields are skipped.
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct TemplateProbe {
    #[prost(int32, required, tag = "154467")]
    pub template_id: i32,
}

enum Inner {
    Disconnected,
    Whole(WsStream),
    Split(SharedSink),
}

pub struct RithmicClient {
    inner: Inner,
}

impl RithmicClient {
    pub fn new() -> Self {
        Self {
            inner: Inner::Disconnected,
        }
    }

    pub fn is_connected(&self) -> bool {
        !matches!(self.inner, Inner::Disconnected)
    }

    /// Open the WebSocket TLS connection. Idempotent: a second call
    /// without close() in between is treated as a programming error.
    pub async fn connect(&mut self, url: &str) -> Result<()> {
        if self.is_connected() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        let (ws, _resp) = connect_async(url).await?;
        self.inner = Inner::Whole(ws);
        Ok(())
    }

    /// Encode `msg` as a protobuf binary frame and send it. Works in
    /// both `Whole` and `Split` modes.
    pub async fn send<M: ProstMessage>(&mut self, msg: &M) -> Result<()> {
        let mut buf = Vec::with_capacity(msg.encoded_len());
        msg.encode(&mut buf)?;
        tracing::trace!("send {} bytes", buf.len());
        match &mut self.inner {
            Inner::Whole(ws) => ws.send(Message::Binary(buf)).await?,
            Inner::Split(sink) => {
                let mut s = sink.lock().await;
                s.send(Message::Binary(buf)).await?;
            }
            Inner::Disconnected => return Err(ConnectorError::NotConnected),
        }
        Ok(())
    }

    /// Block on the next binary frame, transparently answering pings
    /// and skipping non-binary frames. Only valid in `Whole` mode —
    /// after split, the reader task owns the read half and synchronous
    /// recv is no longer available.
    pub async fn recv_raw(&mut self) -> Result<Vec<u8>> {
        let ws = match &mut self.inner {
            Inner::Whole(ws) => ws,
            Inner::Split(_) => {
                return Err(ConnectorError::Other(
                    "recv_raw not available after split".into(),
                ))
            }
            Inner::Disconnected => return Err(ConnectorError::NotConnected),
        };

        loop {
            let frame = ws
                .next()
                .await
                .ok_or(ConnectorError::ConnectionClosed)??;

            match frame {
                Message::Binary(data) => return Ok(data),
                Message::Ping(payload) => {
                    ws.send(Message::Pong(payload)).await?;
                }
                Message::Close(_) => return Err(ConnectorError::ConnectionClosed),
                _ => {}
            }
        }
    }

    /// Receive the next frame and decode it as `M`. Caller is
    /// expected to assert the resulting `template_id` matches what
    /// the protocol step requires.
    pub async fn recv<M: ProstMessage + Default>(&mut self) -> Result<M> {
        let data = self.recv_raw().await?;
        Ok(M::decode(data.as_slice())?)
    }

    /// Receive the next frame and peek its template_id without
    /// committing to a concrete decode.
    #[allow(dead_code)]
    pub async fn recv_probe(&mut self) -> Result<(i32, Vec<u8>)> {
        let data = self.recv_raw().await?;
        let probe = TemplateProbe::decode(data.as_slice())?;
        Ok((probe.template_id, data))
    }

    /// Move the read half of the WebSocket out (typically handed off
    /// to a reader task). The sink half is wrapped in
    /// `Arc<Mutex<...>>` and retained for sending.
    ///
    /// Returns the read half plus a clone of the shared sink so the
    /// caller can build a reader task that also needs to send (e.g.
    /// pongs).
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

    /// Clone of the shared sink, available only after `into_split()`.
    /// Used by background tasks (reader, heartbeat) that need to send
    /// frames without holding `&mut self` on the adapter.
    pub fn shared_sink(&self) -> Option<SharedSink> {
        match &self.inner {
            Inner::Split(sink) => Some(Arc::clone(sink)),
            _ => None,
        }
    }

    /// Close the WebSocket cleanly. Safe to call when not connected.
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

impl Default for RithmicClient {
    fn default() -> Self {
        Self::new()
    }
}
