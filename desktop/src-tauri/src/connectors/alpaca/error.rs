use thiserror::Error;

#[derive(Error, Debug)]
pub enum AlpacaError {
    #[error("Alpaca API keys not configured — set them in Settings")]
    NoApiKey,

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Alpaca unauthorized (HTTP 401/403) — check your API keys")]
    Unauthorized,

    #[error("Alpaca rate limited (HTTP 429) — retry later")]
    RateLimited,

    #[error("Alpaca upstream error (HTTP {0})")]
    Upstream(u16),

    #[error("Alpaca returned unexpected payload: {0}")]
    Decode(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

pub type Result<T> = std::result::Result<T, AlpacaError>;
