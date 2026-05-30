//! Tauri commands for the AI Agent module.
//!
//! `ai_agent_send` is fire-and-forget : it spawns a task that streams
//! the Anthropic response, emitting one Tauri event per text delta and
//! a final `done` event with usage info. The frontend listens to these
//! events and renders incrementally.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::connectors::anthropic::{
    api_key, stream_message, AnthropicError, Message, StreamEvent, DEFAULT_MODEL,
};

const DEFAULT_MAX_TOKENS: u32 = 4096;
const EVENT_DELTA: &str = "ai_agent:delta";
const EVENT_DONE: &str = "ai_agent:done";
const EVENT_ERROR: &str = "ai_agent:error";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendArgs {
    /// Unique id tagged onto every emitted event so the frontend can
    /// route chunks to the correct in-flight bubble.
    pub request_id: String,
    /// System prompt — includes the live trading context block built
    /// by the frontend (snapshots of GEX, footprint, etc.).
    pub system: String,
    /// Conversation history. The latest entry MUST be the user turn
    /// that triggered this request.
    pub messages: Vec<Message>,
    /// Optional override of the default model.
    #[serde(default)]
    pub model: Option<String>,
    /// Optional override of max_tokens.
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DeltaEvent {
    request_id: String,
    text: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    request_id: String,
    stop_reason: Option<String>,
    input_tokens: u64,
    output_tokens: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    request_id: String,
    message: String,
}

#[tauri::command]
pub async fn ai_agent_send(app: AppHandle, args: SendArgs) -> Result<(), String> {
    let key = tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("anthropic vault: {e}"))?
        .ok_or_else(|| "Anthropic API key not configured".to_string())?;

    let model = args.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let max_tokens = args.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
    let request_id = args.request_id.clone();

    // Spawn so the command returns immediately; the actual chat happens
    // out-of-band via emitted events.
    tokio::spawn(async move {
        let req_id = request_id;
        let app_clone = app.clone();
        let req_id_for_cb = req_id.clone();

        let result = stream_message(
            &key,
            &model,
            &args.system,
            &args.messages,
            max_tokens,
            move |evt| match evt {
                StreamEvent::TextDelta(t) => {
                    let _ = app_clone.emit(
                        EVENT_DELTA,
                        DeltaEvent {
                            request_id: req_id_for_cb.clone(),
                            text: t,
                        },
                    );
                }
                StreamEvent::Done {
                    stop_reason,
                    input_tokens,
                    output_tokens,
                } => {
                    let _ = app_clone.emit(
                        EVENT_DONE,
                        DoneEvent {
                            request_id: req_id_for_cb.clone(),
                            stop_reason,
                            input_tokens,
                            output_tokens,
                        },
                    );
                }
                StreamEvent::Error(msg) => {
                    let _ = app_clone.emit(
                        EVENT_ERROR,
                        ErrorEvent {
                            request_id: req_id_for_cb.clone(),
                            message: msg,
                        },
                    );
                }
            },
        )
        .await;

        if let Err(err) = result {
            let message = match err {
                AnthropicError::NoApiKey => "API key missing".to_string(),
                AnthropicError::Unauthorized => {
                    "Unauthorized — check your Anthropic API key".to_string()
                }
                AnthropicError::RateLimited => {
                    "Rate limited — wait a moment and retry".to_string()
                }
                AnthropicError::Upstream { status, body } => {
                    format!("Anthropic error (HTTP {status}): {body}")
                }
                AnthropicError::Decode(s) => format!("Decode error: {s}"),
                AnthropicError::Network(e) => format!("Network error: {e}"),
                AnthropicError::Keyring(e) => format!("Keyring error: {e}"),
            };
            tracing::error!("ai_agent stream failed: {}", message);
            let _ = app.emit(
                EVENT_ERROR,
                ErrorEvent {
                    request_id: req_id.clone(),
                    message,
                },
            );
        }
    });

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKeyArgs {
    pub api_key: String,
}

#[tauri::command]
pub async fn ai_agent_save_api_key(args: SaveKeyArgs) -> Result<(), String> {
    let k = args.api_key.trim().to_string();
    if k.is_empty() {
        return Err("API key cannot be empty".to_string());
    }
    tokio::task::spawn_blocking(move || api_key::save(&k))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_agent_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_agent_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(api_key::delete)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}
