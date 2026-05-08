//! Auth client for /api/license/login + /api/license/heartbeat.
//!
//! Talks to the OrderflowV2 web backend and persists the resulting JWT
//! to a file inside the app's data dir (so the user doesn't have to
//! retype credentials on every launch). MVP-grade — the token lives in
//! plaintext for now and will move to Stronghold or the OS keyring in
//! a follow-up.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use tokio::fs;

const SESSION_FILE: &str = "session.json";

fn default_api_base() -> String {
    // Default to the deployed prod backend in both debug and release
    // builds. We almost never run Next.js locally during desktop iteration
    // (Phase 7+ work is all about the Rithmic connector + footprint
    // engine), and the prod license endpoint is what we want to validate
    // against anyway. Devs who actively work on the Next.js side can
    // still point at localhost via the ORDERFLOWV2_API_BASE override.
    std::env::var("ORDERFLOWV2_API_BASE")
        .unwrap_or_else(|_| "https://orderflow-v2.vercel.app".to_string())
}

/* ─── wire types (mirror the Next.js routes) ─────────────────────── */

#[derive(Serialize)]
struct LoginRequest<'a> {
    email:       &'a str,
    password:    &'a str,
    #[serde(rename = "machineId")]
    machine_id:  &'a str,
    os:          Option<&'a str>,
    #[serde(rename = "appVersion")]
    app_version: Option<&'a str>,
}

#[derive(Serialize, Default)]
struct HeartbeatRequest<'a> {
    os:          Option<&'a str>,
    #[serde(rename = "appVersion")]
    app_version: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseSnapshot {
    #[serde(rename = "licenseKey")]    pub license_key:     String,
    pub status:                        String,
    #[serde(rename = "maxMachines")]   pub max_machines:    u32,
    #[serde(rename = "activeMachines")] pub active_machines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub ok:        bool,
    pub token:     String,
    #[serde(rename = "expiresAt")] pub expires_at: String,
    pub license:   LicenseSnapshot,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    pub error:   Option<String>,
    pub message: Option<String>,
}

/* ─── persisted session ──────────────────────────────────────────── */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token:      String,
    pub expires_at: String,
    pub license:    LicenseSnapshot,
}

/* ─── errors ─────────────────────────────────────────────────────── */

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("network error: {0}")]
    Network(String),
    #[error("server returned {status}: {error_code}{}", .message.as_deref().map(|m| format!(" — {}", m)).unwrap_or_default())]
    Api { status: u16, error_code: String, message: Option<String> },
    #[error("could not parse response: {0}")]
    Parse(String),
    #[error("could not persist session: {0}")]
    Storage(String),
    #[error("no session")]
    NoSession,
}

impl serde::Serialize for AuthError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/* ─── HTTP client ────────────────────────────────────────────────── */

fn client() -> Result<reqwest::Client, AuthError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| AuthError::Network(e.to_string()))
}

pub async fn login(
    email:       &str,
    password:    &str,
    machine_id:  &str,
    os:          Option<&str>,
    app_version: Option<&str>,
) -> Result<LoginResponse, AuthError> {
    let url = format!("{}/api/license/login", default_api_base());
    let resp = client()?
        .post(&url)
        .json(&LoginRequest { email, password, machine_id, os, app_version })
        .send()
        .await
        .map_err(|e| AuthError::Network(e.to_string()))?;

    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| AuthError::Network(e.to_string()))?;

    if !status.is_success() {
        let parsed = serde_json::from_slice::<ErrorResponse>(&bytes).unwrap_or(ErrorResponse {
            error: None,
            message: None,
        });
        return Err(AuthError::Api {
            status:     status.as_u16(),
            error_code: parsed.error.unwrap_or_else(|| "UNKNOWN".to_string()),
            message:    parsed.message,
        });
    }

    serde_json::from_slice::<LoginResponse>(&bytes).map_err(|e| AuthError::Parse(e.to_string()))
}

/// Build the URL the desktop webview should navigate to (or set as
/// an iframe src) to land on `next_path` with a NextAuth session
/// cookie set. The token must be a fresh license JWT — the bridge
/// endpoint enforces a 60s freshness guard, so callers should
/// hit `heartbeat()` immediately before invoking this.
pub fn build_bridge_url(token: &str, next_path: &str) -> Result<String, AuthError> {
    let base = format!("{}/api/auth/desktop-bridge", default_api_base());
    let mut u = url::Url::parse(&base).map_err(|e| AuthError::Parse(e.to_string()))?;
    u.query_pairs_mut()
        .append_pair("token", token)
        .append_pair("next", next_path);
    Ok(u.into())
}

pub async fn heartbeat(
    token:       &str,
    os:          Option<&str>,
    app_version: Option<&str>,
) -> Result<LoginResponse, AuthError> {
    let url = format!("{}/api/license/heartbeat", default_api_base());
    let resp = client()?
        .post(&url)
        .bearer_auth(token)
        .json(&HeartbeatRequest { os, app_version })
        .send()
        .await
        .map_err(|e| AuthError::Network(e.to_string()))?;

    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| AuthError::Network(e.to_string()))?;

    if !status.is_success() {
        let parsed = serde_json::from_slice::<ErrorResponse>(&bytes).unwrap_or(ErrorResponse {
            error: None,
            message: None,
        });
        return Err(AuthError::Api {
            status:     status.as_u16(),
            error_code: parsed.error.unwrap_or_else(|| "UNKNOWN".to_string()),
            message:    parsed.message,
        });
    }

    serde_json::from_slice::<LoginResponse>(&bytes).map_err(|e| AuthError::Parse(e.to_string()))
}

/* ─── persistence (plaintext for MVP — Stronghold later) ─────────── */

fn session_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join(SESSION_FILE)
}

pub async fn save_session(data_dir: &PathBuf, session: &Session) -> Result<(), AuthError> {
    fs::create_dir_all(data_dir).await.map_err(|e| AuthError::Storage(e.to_string()))?;
    let json = serde_json::to_vec_pretty(session).map_err(|e| AuthError::Storage(e.to_string()))?;
    fs::write(session_path(data_dir), json).await.map_err(|e| AuthError::Storage(e.to_string()))
}

pub async fn load_session(data_dir: &PathBuf) -> Result<Session, AuthError> {
    let path = session_path(data_dir);
    if !path.exists() {
        return Err(AuthError::NoSession);
    }
    let bytes = fs::read(&path).await.map_err(|e| AuthError::Storage(e.to_string()))?;
    serde_json::from_slice::<Session>(&bytes).map_err(|e| AuthError::Storage(e.to_string()))
}

pub async fn clear_session(data_dir: &PathBuf) -> Result<(), AuthError> {
    let path = session_path(data_dir);
    if path.exists() {
        fs::remove_file(path).await.map_err(|e| AuthError::Storage(e.to_string()))?;
    }
    Ok(())
}
