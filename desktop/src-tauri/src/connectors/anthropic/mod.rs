//! Anthropic Messages API connector — backs the AI Agent module.
//! Free entry: `stream_message(api_key, model, system, messages, max_tokens, callback)`.

pub mod api_key;
pub mod client;
pub mod error;

pub use client::{stream_message, Message, StreamEvent, DEFAULT_MODEL};
pub use error::{AnthropicError, Result};
