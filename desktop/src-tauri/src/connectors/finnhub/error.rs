use thiserror::Error;

#[derive(Error, Debug)]
pub enum FinnhubError {
    #[error("Finnhub API key not configured — set it in Settings")]
    NoApiKey,

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Finnhub unauthorized (HTTP 401) — check your API key")]
    Unauthorized,

    #[error("Finnhub rate limited (HTTP 429) — retry later")]
    RateLimited,

    #[error("Finnhub upstream error (HTTP {0})")]
    Upstream(u16),

    #[error("Finnhub returned unexpected payload: {0}")]
    Decode(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

pub type Result<T> = std::result::Result<T, FinnhubError>;
