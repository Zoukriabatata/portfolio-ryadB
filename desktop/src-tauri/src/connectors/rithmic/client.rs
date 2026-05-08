//! Low-level Rithmic WebSocket transport.
//!
//! Each WebSocket binary frame is one protobuf-encoded message — no
//! length prefix, no envelope. Every Rithmic message carries a
//! `template_id: i32` (wire tag 154467) which identifies the type;
//! callers either decode directly into the expected type or peek the
//! template_id first and dispatch.

use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use crate::connectors::error::{ConnectorError, Result};

/// Probe struct used to read just the template_id from any frame
/// without committing to a concrete message type. Wire tag 154467
/// matches every real Rithmic message — unknown fields are skipped.
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct TemplateProbe {
    #[prost(int32, required, tag = "154467")]
    pub template_id: i32,
}

pub struct RithmicClient {
    ws: Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
}

impl RithmicClient {
    pub fn new() -> Self {
        Self { ws: None }
    }

    pub fn is_connected(&self) -> bool {
        self.ws.is_some()
    }

    /// Open the WebSocket TLS connection. Idempotent: a second call
    /// without close() in between is treated as a programming error.
    pub async fn connect(&mut self, url: &str) -> Result<()> {
        if self.ws.is_some() {
            return Err(ConnectorError::Other("already connected".into()));
        }
        let (ws, _resp) = connect_async(url).await?;
        self.ws = Some(ws);
        Ok(())
    }

    /// Encode `msg` as a protobuf binary frame and send it.
    pub async fn send<M: ProstMessage>(&mut self, msg: &M) -> Result<()> {
        let ws = self.ws.as_mut().ok_or(ConnectorError::NotConnected)?;
        let mut buf = Vec::with_capacity(msg.encoded_len());
        msg.encode(&mut buf)?;
        ws.send(Message::Binary(buf)).await?;
        Ok(())
    }

    /// Block on the next binary frame, transparently answering pings
    /// and skipping non-binary frames. Returns the raw protobuf bytes.
    pub async fn recv_raw(&mut self) -> Result<Vec<u8>> {
        let ws = self.ws.as_mut().ok_or(ConnectorError::NotConnected)?;

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
                // Text/Pong/Frame are not part of the Rithmic protocol — skip.
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
    pub async fn recv_probe(&mut self) -> Result<(i32, Vec<u8>)> {
        let data = self.recv_raw().await?;
        let probe = TemplateProbe::decode(data.as_slice())?;
        Ok((probe.template_id, data))
    }

    /// Close the WebSocket cleanly. Safe to call when not connected.
    pub async fn close(&mut self) -> Result<()> {
        if let Some(mut ws) = self.ws.take() {
            ws.close(None).await?;
        }
        Ok(())
    }
}

impl Default for RithmicClient {
    fn default() -> Self {
        Self::new()
    }
}
