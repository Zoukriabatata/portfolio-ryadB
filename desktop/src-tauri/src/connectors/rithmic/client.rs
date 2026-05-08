//! Low-level Rithmic WebSocket client.
//!
//! Phase 7.3 will implement:
//!  - WebSocket TLS connect to `wss://rituz00100.rithmic.com:443`
//!  - send/recv protobuf-framed messages (each WS binary frame = one
//!    protobuf-encoded message; no length prefix)
//!  - template_id dispatch (decode `Base` first to read template_id,
//!    then re-decode as the concrete type)
//!  - heartbeat task using the interval from ResponseLogin

pub struct RithmicClient {
    // Phase 7.3: WebSocket sink/stream halves, gateway URL, etc.
}

impl RithmicClient {
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for RithmicClient {
    fn default() -> Self {
        Self::new()
    }
}
