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
    email: &'a str,
    password: &'a str,
    #[serde(rename = "machineId")]
    machine_id: &'a str,
    os: Option<&'a str>,
    #[serde(rename = "appVersion")]
    app_version: Option<&'a str>,
}

#[derive(Serialize, Default)]
struct HeartbeatRequest<'a> {
    os: Option<&'a str>,
    #[serde(rename = "appVersion")]
    app_version: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseSnapshot {
    #[serde(rename = "licenseKey")]
    pub license_key: String,
    pub status: String,
    #[serde(rename = "maxMachines")]
    pub max_machines: u32,
    #[serde(rename = "activeMachines")]
    pub active_machines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub ok: bool,
    pub token: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
    pub license: LicenseSnapshot,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    pub error: Option<String>,
    pub message: Option<String>,
}

/* ─── persisted session ──────────────────────────────────────────── */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub expires_at: String,
    pub license: LicenseSnapshot,
    /// Email used to log in. Captured client-side at login time
    /// (the API doesn't return it). `None` for sessions persisted
    /// by versions older than 2026-05-26 — re-login to populate.
    #[serde(default)]
    pub email: Option<String>,
}

/* ─── errors ─────────────────────────────────────────────────────── */

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("network error: {0}")]
    Network(String),
    #[error("server returned {status}: {error_code}{}", .message.as_deref().map(|m| format!(" — {}", m)).unwrap_or_default())]
    Api {
        status: u16,
        error_code: String,
        message: Option<String>,
    },
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
    email: &str,
    password: &str,
    machine_id: &str,
    os: Option<&str>,
    app_version: Option<&str>,
) -> Result<LoginResponse, AuthError> {
    let url = format!("{}/api/license/login", default_api_base());
    let resp = client()?
        .post(&url)
        .json(&LoginRequest {
            email,
            password,
            machine_id,
            os,
            app_version,
        })
        .send()
        .await
        .map_err(|e| AuthError::Network(e.to_string()))?;

    let status = resp.status();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AuthError::Network(e.to_string()))?;

    if !status.is_success() {
        let parsed = serde_json::from_slice::<ErrorResponse>(&bytes).unwrap_or(ErrorResponse {
            error: None,
            message: None,
        });
        return Err(AuthError::Api {
            status: status.as_u16(),
            error_code: parsed.error.unwrap_or_else(|| "UNKNOWN".to_string()),
            message: parsed.message,
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
    token: &str,
    os: Option<&str>,
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
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AuthError::Network(e.to_string()))?;

    if !status.is_success() {
        let parsed = serde_json::from_slice::<ErrorResponse>(&bytes).unwrap_or(ErrorResponse {
            error: None,
            message: None,
        });
        return Err(AuthError::Api {
            status: status.as_u16(),
            error_code: parsed.error.unwrap_or_else(|| "UNKNOWN".to_string()),
            message: parsed.message,
        });
    }

    serde_json::from_slice::<LoginResponse>(&bytes).map_err(|e| AuthError::Parse(e.to_string()))
}

/* ─── persistence ─────────────────────────────────────────────────
 *
 * Hardened for the 1.0 commercial release:
 *
 *   • The JWT token (the only piece a thief can actually USE) is
 *     stored in the OS keyring — Windows Credential Manager on
 *     Windows, Keychain on macOS, Secret Service on Linux. Editing
 *     the local `session.json` no longer extends or forges a
 *     session: the file holds only non-sensitive metadata
 *     (license info, expires_at, email).
 *
 *   • If the keyring is unavailable (rare Linux setups without
 *     a Secret Service daemon, or sandboxed CI environments), we
 *     fall back to writing the full Session including token to
 *     `session.json`. This is degraded security but preserves
 *     functionality. A warning is logged so devops can spot it.
 *
 *   • Migration: pre-1.0 builds wrote the token straight into
 *     `session.json`. On first load post-upgrade, we detect that,
 *     move the token into the keyring, and rewrite the file
 *     without it. Idempotent — re-running on a clean install is
 *     a no-op.
 */

const KEYRING_SERVICE: &str = "orderflow-v2-desktop";
/// Stable keyring username used when we don't have an email yet
/// (very rare — only between login submit and the first save).
const KEYRING_USER_DEFAULT: &str = "session-token";

fn session_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join(SESSION_FILE)
}

/// Choose the keyring username: prefer the session's email so each
/// user on a shared OS account gets a distinct entry. Fall back to a
/// constant for the (very narrow) window where email isn't set yet.
fn keyring_user(session: &Session) -> &str {
    session
        .email
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(KEYRING_USER_DEFAULT)
}

/// Persisted on-disk shape — token is INTENTIONALLY omitted from
/// the serialized representation when the keyring is available.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedSession {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    expires_at: String,
    license: LicenseSnapshot,
    #[serde(default)]
    email: Option<String>,
}

impl From<&Session> for PersistedSession {
    fn from(s: &Session) -> Self {
        Self {
            token: None, // keyring-backed by default
            expires_at: s.expires_at.clone(),
            license: s.license.clone(),
            email: s.email.clone(),
        }
    }
}

fn try_save_keyring(user: &str, token: &str) -> Result<(), keyring::Error> {
    keyring::Entry::new(KEYRING_SERVICE, user)?.set_password(token)
}

fn try_load_keyring(user: &str) -> Result<String, keyring::Error> {
    keyring::Entry::new(KEYRING_SERVICE, user)?.get_password()
}

fn try_delete_keyring(user: &str) -> Result<(), keyring::Error> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, user)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // "No entry" is benign on logout — already cleared.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}

pub async fn save_session(data_dir: &PathBuf, session: &Session) -> Result<(), AuthError> {
    fs::create_dir_all(data_dir)
        .await
        .map_err(|e| AuthError::Storage(e.to_string()))?;

    let user = keyring_user(session).to_string();
    let token = session.token.clone();

    // Try to push the token into the OS keyring on a blocking thread —
    // keyring 3.x is sync and may touch a D-Bus / WinCred RPC.
    let keyring_ok = tokio::task::spawn_blocking(move || try_save_keyring(&user, &token))
        .await
        .map_err(|e| AuthError::Storage(format!("keyring task join: {}", e)))?
        .is_ok();

    let mut persisted: PersistedSession = session.into();
    if !keyring_ok {
        // Keyring unavailable — degraded mode: keep token in plaintext.
        tracing::warn!(
            "OS keyring unavailable — falling back to plaintext session.json. \
             Token confidentiality is reduced. Investigate before commercial \
             deploy on this host."
        );
        persisted.token = Some(session.token.clone());
    }

    let json = serde_json::to_vec_pretty(&persisted)
        .map_err(|e| AuthError::Storage(e.to_string()))?;
    fs::write(session_path(data_dir), json)
        .await
        .map_err(|e| AuthError::Storage(e.to_string()))
}

pub async fn load_session(data_dir: &PathBuf) -> Result<Session, AuthError> {
    let path = session_path(data_dir);
    if !path.exists() {
        return Err(AuthError::NoSession);
    }
    let bytes = fs::read(&path)
        .await
        .map_err(|e| AuthError::Storage(e.to_string()))?;
    let persisted: PersistedSession =
        serde_json::from_slice(&bytes).map_err(|e| AuthError::Storage(e.to_string()))?;

    // 1. If the file still has a token (pre-1.0 layout or keyring fallback),
    //    use it as-is and silently migrate to the keyring for next time.
    if let Some(plain_token) = persisted.token.clone() {
        let session = Session {
            token: plain_token.clone(),
            expires_at: persisted.expires_at.clone(),
            license: persisted.license.clone(),
            email: persisted.email.clone(),
        };
        // Best-effort migration: push the token into the keyring
        // and rewrite the file without it. Failures are non-fatal.
        if let Err(e) = save_session(data_dir, &session).await {
            tracing::warn!("session migration to keyring failed: {}", e);
        }
        return Ok(session);
    }

    // 2. No token on disk — fetch from the keyring.
    let user = persisted
        .email
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| KEYRING_USER_DEFAULT.to_string());
    let token = tokio::task::spawn_blocking(move || try_load_keyring(&user))
        .await
        .map_err(|e| AuthError::Storage(format!("keyring task join: {}", e)))?
        .map_err(|e| match e {
            keyring::Error::NoEntry => AuthError::NoSession,
            other => AuthError::Storage(format!("keyring read: {}", other)),
        })?;

    Ok(Session {
        token,
        expires_at: persisted.expires_at,
        license: persisted.license,
        email: persisted.email,
    })
}

pub async fn clear_session(data_dir: &PathBuf) -> Result<(), AuthError> {
    // 1. Remove the metadata file. Done first so that a failure to
    //    touch the keyring still leaves an obviously-logged-out state
    //    on the next launch.
    let path = session_path(data_dir);
    if path.exists() {
        // Try to read the email out before we delete so we can target
        // the right keyring entry.
        let maybe_email = fs::read(&path)
            .await
            .ok()
            .and_then(|bytes| serde_json::from_slice::<PersistedSession>(&bytes).ok())
            .and_then(|p| p.email);

        fs::remove_file(&path)
            .await
            .map_err(|e| AuthError::Storage(e.to_string()))?;

        // 2. Remove from the keyring. Try the email-keyed entry if we
        //    know it, then the default entry as a safety net.
        let users: Vec<String> = match maybe_email.filter(|s| !s.is_empty()) {
            Some(email) => vec![email, KEYRING_USER_DEFAULT.to_string()],
            None => vec![KEYRING_USER_DEFAULT.to_string()],
        };
        let _ = tokio::task::spawn_blocking(move || {
            for u in users {
                let _ = try_delete_keyring(&u);
            }
        })
        .await;
    }
    Ok(())
}
