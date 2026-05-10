use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConnectorError {
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("URL parse error: {0}")]
    Url(#[from] url::ParseError),

    #[error("Protobuf decode error: {0}")]
    ProtoDecode(#[from] prost::DecodeError),

    #[error("Protobuf encode error: {0}")]
    ProtoEncode(#[from] prost::EncodeError),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Subscription failed: {0}")]
    SubscriptionFailed(String),

    #[error("Connection closed")]
    ConnectionClosed,

    #[error("Not connected")]
    NotConnected,

    #[error("Unexpected message: template_id={0}")]
    UnexpectedMessage(i32),

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, ConnectorError>;
