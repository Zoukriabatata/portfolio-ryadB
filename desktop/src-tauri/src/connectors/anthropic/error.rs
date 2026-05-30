use thiserror::Error;

#[derive(Error, Debug)]
pub enum AnthropicError {
    #[error("Anthropic API key not configured — set it in AI Agent settings")]
    NoApiKey,

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Anthropic unauthorized (HTTP 401) — check your API key")]
    Unauthorized,

    #[error("Anthropic rate limited (HTTP 429) — retry later")]
    RateLimited,

    #[error("Anthropic upstream error (HTTP {status}): {body}")]
    Upstream { status: u16, body: String },

    #[error("Anthropic returned unexpected payload: {0}")]
    Decode(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

pub type Result<T> = std::result::Result<T, AnthropicError>;
