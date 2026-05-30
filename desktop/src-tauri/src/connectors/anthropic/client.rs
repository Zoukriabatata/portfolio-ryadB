//! Anthropic Messages API client with SSE streaming.
//!
//! POST https://api.anthropic.com/v1/messages with `stream: true` opens
//! a Server-Sent-Events response. We parse it line-by-line and yield
//! semantic events (text deltas + final usage) via a caller-provided
//! callback — the command layer emits Tauri events from there.

use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::connectors::anthropic::error::{AnthropicError, Result};

const ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// Default model — sweet spot for interactive chat (fast + capable).
pub const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String, // "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Incremental text chunk to append to the assistant's reply.
    TextDelta(String),
    /// Final usage info + stop reason — emitted once at the end.
    Done {
        stop_reason: Option<String>,
        input_tokens: u64,
        output_tokens: u64,
    },
    /// Server-side error returned mid-stream.
    Error(String),
}

#[derive(Debug, Serialize)]
struct RequestBody<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: &'a [Message],
    stream: bool,
}

/// Stream a single completion. The callback fires once per parsed
/// stream event. Returns once the stream terminates (either with
/// `message_stop` or an error event).
pub async fn stream_message<F>(
    api_key: &str,
    model: &str,
    system: &str,
    messages: &[Message],
    max_tokens: u32,
    mut on_event: F,
) -> Result<()>
where
    F: FnMut(StreamEvent) + Send,
{
    if api_key.trim().is_empty() {
        return Err(AnthropicError::NoApiKey);
    }

    let body = RequestBody {
        model,
        max_tokens,
        system,
        messages,
        stream: true,
    };

    let http = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()?;

    let resp = http
        .post(ENDPOINT)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream")
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if status != 200 {
        let body = resp.text().await.unwrap_or_default();
        return match status {
            401 => Err(AnthropicError::Unauthorized),
            429 => Err(AnthropicError::RateLimited),
            _ => Err(AnthropicError::Upstream {
                status,
                body: body.chars().take(400).collect(),
            }),
        };
    }

    let mut stream = Box::pin(resp.bytes_stream());
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        buffer.push_str(&String::from_utf8_lossy(bytes.as_ref()));

        // SSE event boundary = "\n\n". Process every completed event in
        // the buffer; keep the trailing partial for the next round.
        while let Some(idx) = buffer.find("\n\n") {
            let event_text = buffer[..idx].to_string();
            buffer.drain(..idx + 2);
            if let Some(evt) = parse_sse_event(&event_text) {
                on_event(evt);
            }
        }
    }

    Ok(())
}

/// Parse a single SSE event block of the shape:
///   event: <name>
///   data: <json>
/// Returns Some only for events we care about.
fn parse_sse_event(block: &str) -> Option<StreamEvent> {
    let mut event_name: Option<&str> = None;
    let mut data_line: Option<&str> = None;
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event_name = Some(rest.trim());
        } else if let Some(rest) = line.strip_prefix("data:") {
            data_line = Some(rest.trim());
        }
    }

    let name = event_name?;
    let data = data_line?;

    match name {
        "content_block_delta" => {
            #[derive(Deserialize)]
            struct Wrap {
                delta: Delta,
            }
            #[derive(Deserialize)]
            struct Delta {
                #[serde(default, rename = "type")]
                _type: Option<String>,
                #[serde(default)]
                text: Option<String>,
            }
            let parsed: Wrap = serde_json::from_str(data).ok()?;
            parsed
                .delta
                .text
                .map(StreamEvent::TextDelta)
        }
        "message_delta" => {
            #[derive(Deserialize)]
            struct Wrap {
                #[serde(default)]
                delta: Option<DeltaInfo>,
                #[serde(default)]
                usage: Option<Usage>,
            }
            #[derive(Deserialize)]
            struct DeltaInfo {
                #[serde(default)]
                stop_reason: Option<String>,
            }
            #[derive(Deserialize)]
            struct Usage {
                #[serde(default)]
                input_tokens: Option<u64>,
                #[serde(default)]
                output_tokens: Option<u64>,
            }
            let parsed: Wrap = serde_json::from_str(data).ok()?;
            let stop_reason = parsed.delta.and_then(|d| d.stop_reason);
            let usage = parsed.usage.unwrap_or(Usage {
                input_tokens: None,
                output_tokens: None,
            });
            Some(StreamEvent::Done {
                stop_reason,
                input_tokens: usage.input_tokens.unwrap_or(0),
                output_tokens: usage.output_tokens.unwrap_or(0),
            })
        }
        "error" => {
            #[derive(Deserialize)]
            struct Wrap {
                error: ErrorInfo,
            }
            #[derive(Deserialize)]
            struct ErrorInfo {
                message: String,
            }
            let parsed: Wrap = serde_json::from_str(data).ok()?;
            Some(StreamEvent::Error(parsed.error.message))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_content_block_delta_text() {
        let block = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}";
        let evt = parse_sse_event(block).expect("Some");
        match evt {
            StreamEvent::TextDelta(t) => assert_eq!(t, "Hello"),
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_message_delta_with_usage() {
        let block = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":42}}";
        let evt = parse_sse_event(block).expect("Some");
        match evt {
            StreamEvent::Done { stop_reason, output_tokens, .. } => {
                assert_eq!(stop_reason.as_deref(), Some("end_turn"));
                assert_eq!(output_tokens, 42);
            }
            _ => panic!("expected Done"),
        }
    }

    #[test]
    fn parse_error_event() {
        let block = "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}";
        let evt = parse_sse_event(block).expect("Some");
        match evt {
            StreamEvent::Error(m) => assert_eq!(m, "Overloaded"),
            _ => panic!("expected Error"),
        }
    }

    #[test]
    fn ignores_unknown_events() {
        assert!(parse_sse_event("event: ping\ndata: {}").is_none());
        assert!(parse_sse_event("data: only-data").is_none());
    }
}
