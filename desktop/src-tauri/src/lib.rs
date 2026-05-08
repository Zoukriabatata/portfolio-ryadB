//! OrderflowV2 Desktop — Tauri entry point + IPC commands.
//!
//! The desktop app is a thin shell whose only responsibility for the MVP
//! is to authenticate the user against /api/license/login and keep the
//! session alive via /api/license/heartbeat. The actual trading UI will
//! land in later phases.

mod auth;
pub mod brokers;
mod commands;
pub mod connectors;
pub mod engine;
mod machine;
mod prefs;
mod state;

use auth::{LoginResponse, Session};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Shared app state — holds the current session in memory so subsequent
/// invokes don't have to re-read the session file.
struct AppState {
    session: Mutex<Option<Session>>,
    /// Where session.json lives. Captured at startup so async commands
    /// don't need an AppHandle to resolve it.
    data_dir: PathBuf,
}

fn err_to_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/* ─── IPC commands ─────────────────────────────────────────────── */

#[tauri::command]
async fn cmd_get_session(state: State<'_, Arc<AppState>>) -> Result<Option<Session>, String> {
    Ok(state.session.lock().await.clone())
}

#[tauri::command]
async fn cmd_get_machine_id() -> Result<String, String> {
    machine::get_machine_id().map_err(err_to_string)
}

#[tauri::command]
async fn cmd_login(
    email: String,
    password: String,
    state: State<'_, Arc<AppState>>,
) -> Result<LoginResponse, String> {
    let machine_id = machine::get_machine_id().map_err(err_to_string)?;
    let os = machine::get_os();

    let resp = auth::login(&email, &password, &machine_id, Some(os), Some(APP_VERSION))
        .await
        .map_err(err_to_string)?;

    let session = Session {
        token:      resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license:    resp.license.clone(),
    };
    auth::save_session(&state.data_dir, &session)
        .await
        .map_err(err_to_string)?;
    *state.session.lock().await = Some(session);

    Ok(resp)
}

#[tauri::command]
async fn cmd_logout(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    auth::clear_session(&state.data_dir).await.map_err(err_to_string)?;
    *state.session.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn cmd_get_first_launch_completed(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(prefs::load_prefs(&state.data_dir).await.first_launch_completed)
}

#[tauri::command]
async fn cmd_mark_first_launch_completed(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    prefs::mark_first_launch_completed(&state.data_dir)
        .await
        .map_err(err_to_string)
}

/// Build a one-shot bridge URL the webview can use to land on a
/// whitelisted web path (`/live`, `/account`, …) with a valid
/// NextAuth session cookie set.
///
/// Phase 7.8 — drives the iframe-bridge flow:
///   1. Re-issue the license JWT via heartbeat so its `iat` is
///      within the bridge endpoint's 60s freshness guard.
///   2. Persist the rotated token (parity with cmd_heartbeat).
///   3. Build the `?token=…&next=…` URL the webview can navigate to
///      or set as an iframe src.
///
/// Frontend side: see WebFrame.tsx, which calls this on mount and
/// uses the result as the iframe src.
#[tauri::command]
async fn cmd_get_bridge_url(
    next_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    let current_token = {
        let guard = state.session.lock().await;
        guard
            .as_ref()
            .ok_or_else(|| "NO_SESSION".to_string())?
            .token
            .clone()
    };
    let os = machine::get_os();

    let resp = auth::heartbeat(&current_token, Some(os), Some(APP_VERSION))
        .await
        .map_err(err_to_string)?;

    // Persist the rotated token before handing it out, so the
    // freshness guard sees the same value the rest of the shell uses
    // for subsequent IPC calls.
    let session = Session {
        token:      resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license:    resp.license.clone(),
    };
    auth::save_session(&state.data_dir, &session)
        .await
        .map_err(err_to_string)?;
    *state.session.lock().await = Some(session);

    auth::build_bridge_url(&resp.token, &next_path).map_err(err_to_string)
}

#[tauri::command]
async fn cmd_heartbeat(state: State<'_, Arc<AppState>>) -> Result<LoginResponse, String> {
    let token = {
        let guard = state.session.lock().await;
        guard.as_ref().ok_or_else(|| "NO_SESSION".to_string())?.token.clone()
    };
    let os = machine::get_os();

    let resp = auth::heartbeat(&token, Some(os), Some(APP_VERSION))
        .await
        .map_err(err_to_string)?;

    let session = Session {
        token:      resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license:    resp.license.clone(),
    };
    auth::save_session(&state.data_dir, &session)
        .await
        .map_err(err_to_string)?;
    *state.session.lock().await = Some(session);

    Ok(resp)
}

/* ─── setup ────────────────────────────────────────────────────── */

fn build_state(app: &AppHandle) -> Arc<AppState> {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("could not resolve app data dir");

    // Best-effort load of any persisted session — failures fall through
    // to "logged out" rather than crashing on first launch.
    let initial = std::fs::read(data_dir.join("session.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Session>(&b).ok());

    // Migration: if a session exists but prefs.json doesn't, the user
    // upgraded from v0.1.0 — they've seen the app already, so mark
    // first_launch as completed so we don't re-show the welcome screen.
    let prefs_path = data_dir.join("prefs.json");
    if initial.is_some() && !prefs_path.exists() {
        let migrated = prefs::Prefs { first_launch_completed: true };
        if let Ok(json) = serde_json::to_vec_pretty(&migrated) {
            let _ = std::fs::create_dir_all(&data_dir);
            let _ = std::fs::write(&prefs_path, json);
        }
    }

    Arc::new(AppState {
        session: Mutex::new(initial),
        data_dir,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let state = build_state(&app.handle());
            app.manage(state);

            // Rithmic + footprint state lives alongside the auth state.
            // The footprint event emitter outlives login/logout cycles —
            // it subscribes to the long-lived engine, not to any
            // particular adapter.
            let rithmic_state = state::RithmicState::new();
            commands::rithmic_events::spawn_emitter(app.handle().clone(), &rithmic_state.engine);
            app.manage(rithmic_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_get_session,
            cmd_get_machine_id,
            cmd_login,
            cmd_logout,
            cmd_heartbeat,
            cmd_get_bridge_url,
            cmd_get_first_launch_completed,
            cmd_mark_first_launch_completed,
            commands::rithmic::rithmic_login,
            commands::rithmic::rithmic_login_from_vault,
            commands::rithmic::rithmic_subscribe,
            commands::rithmic::rithmic_unsubscribe,
            commands::rithmic::rithmic_get_bars,
            commands::rithmic::rithmic_disconnect,
            commands::rithmic::rithmic_status,
            commands::brokers::list_broker_presets,
            commands::brokers::save_broker_credentials,
            commands::brokers::load_broker_credentials,
            commands::brokers::delete_broker_credentials,
            commands::brokers::test_broker_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
