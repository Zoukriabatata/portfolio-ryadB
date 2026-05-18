//! OrderflowV2 Desktop — Tauri entry point + IPC commands.
//!
//! The desktop app is a thin shell whose only responsibility for the MVP
//! is to authenticate the user against /api/license/login and keep the
//! session alive via /api/license/heartbeat. The actual trading UI will
//! land in later phases.

mod auth;
pub mod brokers;
mod cache;
mod commands;
pub mod connectors;
pub mod engine;
pub mod journal;
mod machine;
mod prefs;
mod state;

use auth::{LoginResponse, Session};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;

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
        token: resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license: resp.license.clone(),
    };
    auth::save_session(&state.data_dir, &session)
        .await
        .map_err(err_to_string)?;
    *state.session.lock().await = Some(session);

    Ok(resp)
}

#[tauri::command]
async fn cmd_logout(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    auth::clear_session(&state.data_dir)
        .await
        .map_err(err_to_string)?;
    *state.session.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn cmd_get_first_launch_completed(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    Ok(prefs::load_prefs(&state.data_dir)
        .await
        .first_launch_completed)
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
        token: resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license: resp.license.clone(),
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
        guard
            .as_ref()
            .ok_or_else(|| "NO_SESSION".to_string())?
            .token
            .clone()
    };
    let os = machine::get_os();

    let resp = auth::heartbeat(&token, Some(os), Some(APP_VERSION))
        .await
        .map_err(err_to_string)?;

    let session = Session {
        token: resp.token.clone(),
        expires_at: resp.expires_at.clone(),
        license: resp.license.clone(),
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
        let migrated = prefs::Prefs {
            first_launch_completed: true,
        };
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
    // Initialize the tracing subscriber so all `tracing::info!` /
    // `tracing::warn!` / `tracing::error!` calls across the Rust
    // codebase actually print to the terminal that ran `tauri dev`.
    // Without this, the entire Rust diagnostic stream is silently
    // dropped — including subscribe failures, reconnect attempts,
    // Rithmic ack rejections, etc. Default level = INFO; bump to
    // DEBUG via env: `RUST_LOG=desktop=debug,tokio_tungstenite=info`.
    let env_filter = std::env::var("RUST_LOG").unwrap_or_else(|_| {
        "info,desktop=debug,tokio_tungstenite=info,hyper=info,h2=info".to_string()
    });
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new(env_filter))
        .with_target(true)
        .with_level(true)
        .with_ansi(true)
        .try_init();

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
            // Subscribe to the Rithmic engine bar stream BEFORE moving
            // `rithmic_state` into `app.manage`. The receiver lives
            // independently of the state struct.
            let rithmic_writer_rx = rithmic_state.engine.updates();
            app.manage(rithmic_state);

            // Phase B / M2 — public crypto adapters share their own
            // FootprintEngine. M3 wires a dedicated event emitter
            // (`crypto-footprint-update`) so React can disambiguate
            // crypto vs Rithmic bar streams when they coexist.
            let crypto_state = state::CryptoState::new();
            commands::crypto_events::spawn_emitter(app.handle().clone(), &crypto_state.engine);
            let crypto_writer_rx = crypto_state.engine.updates();
            app.manage(crypto_state);

            // ── Local bars cache (SQLite) ──────────────────────────────────
            // File path: {app_data_dir}/bars.db. Persists footprint bars so
            // the chart shows a lookback at the next launch without depending
            // on Rithmic HISTORY_PLANT (denied on the Apex account).
            // Retention: 7 days, purged at boot. We subscribe writer tasks to
            // both the Rithmic and the crypto FootprintEngines — the DB is
            // keyed on `full_symbol` so the two streams coexist safely.
            let app_data = app
                .path()
                .app_data_dir()
                .expect("app_data_dir resolvable on a supported platform");
            let db_path = app_data.join("bars.db");
            let conn = cache::open_db(&db_path).expect("open bars.db");
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            match cache::purge_old_bars(&conn, now_ms) {
                Ok(n) => tracing::info!("cache: purged {} expired bars at boot", n),
                Err(e) => tracing::warn!("cache: purge failed at boot: {e}"),
            }
            let cache_db = Arc::new(TokioMutex::new(conn));

            // Spawn one writer per engine. Each writer owns its own
            // `pending` HashMap; the only shared state is the DB
            // connection (briefly held via blocking_lock during flush).
            let rithmic_writer_db = cache_db.clone();
            tauri::async_runtime::spawn(async move {
                let writer = cache::writer::CacheWriter::new(
                    rithmic_writer_db,
                    Duration::from_secs(2),
                );
                writer.run(rithmic_writer_rx).await;
            });

            let crypto_writer_db = cache_db.clone();
            tauri::async_runtime::spawn(async move {
                let writer = cache::writer::CacheWriter::new(
                    crypto_writer_db,
                    Duration::from_secs(2),
                );
                writer.run(crypto_writer_rx).await;
            });

            // Make the connection available to the `cache_query` command.
            app.manage(commands::cache::CacheState::new(cache_db));

            // News module — Finnhub-backed economic calendar + articles.
            // Cached in-memory (5 min calendar / 60 s news) to spare the
            // free-tier rate limit.
            app.manage(commands::news::NewsState::new());

            // Account module — owns the long-lived PnL + Order plant
            // adapters when the user is on /account. Empty until
            // `account_start_live` is invoked from the frontend.
            app.manage(commands::account::AccountState::new());

            // GEX module — Tradier sandbox snapshot cache (15 min TTL).
            // Each (SPY/QQQ) snapshot lives in this cache; refresh
            // beyond TTL re-fetches from Tradier.
            app.manage(commands::gex::GexState::new());

            // Native Journal SQLite — opened once at startup, lives
            // for the app's lifetime. Path = OS app-data dir +
            // `journal.db` (created on first launch).
            let journal_path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("journal.db");
            match journal::JournalDb::open(journal_path.clone()) {
                Ok(db) => {
                    tracing::info!("journal: opened DB at {:?}", journal_path);
                    app.manage(journal::commands::JournalState(std::sync::Arc::new(db)));
                }
                Err(e) => {
                    tracing::error!("journal: failed to open DB at {:?}: {}", journal_path, e);
                }
            }

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
            commands::rithmic::rithmic_fetch_history,
            commands::rithmic::rithmic_fetch_tick_history,
            commands::rithmic::rithmic_probe_tick_replay,
            commands::rithmic::rithmic_disconnect,
            commands::rithmic::rithmic_status,
            commands::brokers::list_broker_presets,
            commands::brokers::save_broker_credentials,
            commands::brokers::load_broker_credentials,
            commands::brokers::delete_broker_credentials,
            commands::brokers::test_broker_connection,
            commands::crypto::crypto_connect,
            commands::crypto::crypto_subscribe,
            commands::crypto::crypto_unsubscribe,
            commands::crypto::crypto_disconnect,
            commands::crypto::crypto_status,
            commands::crypto::crypto_orderbook_subscribe,
            commands::crypto::crypto_orderbook_unsubscribe,
            commands::cache::cache_query,
            // Native Journal — Day 1: trades CRUD + listing + stats.
            journal::commands::journal_list_trades,
            journal::commands::journal_get_trade,
            journal::commands::journal_create_trade,
            journal::commands::journal_update_trade,
            journal::commands::journal_delete_trade,
            journal::commands::journal_bulk_delete,
            // Day 2: calendar aggregate + per-day trades + daily notes.
            journal::commands::journal_calendar_month,
            journal::commands::journal_trades_on_day,
            journal::commands::journal_save_daily_note,
            journal::commands::journal_delete_daily_note,
            journal::commands::journal_list_daily_notes_month,
            // Rithmic broker sync — auto-import fills as round-trip trades.
            journal::commands::journal_sync_rithmic,
            journal::commands::journal_rithmic_sync_status,
            // CSV batch import (Apex export, NinjaTrader, etc.).
            journal::commands::journal_import_trades,
            // Day 3 — Playbook setups (saved trade ideas + criteria).
            journal::commands::journal_list_playbook_setups,
            journal::commands::journal_save_playbook_setup,
            journal::commands::journal_delete_playbook_setup,
            // News module — Finnhub calendar + articles + key vault.
            commands::news::news_fetch_calendar,
            commands::news::news_fetch_articles,
            commands::news::news_save_api_key,
            commands::news::news_has_api_key,
            commands::news::news_delete_api_key,
            // Account module — discovery + live feed lifecycle.
            commands::account::account_list,
            commands::account::account_start_live,
            commands::account::account_stop_live,
            commands::account::account_fetch_today_trades,
            // GEX module — Tradier snapshot + api key vault.
            commands::gex::gex_fetch_snapshot,
            commands::gex::gex_save_api_key,
            commands::gex::gex_has_api_key,
            commands::gex::gex_delete_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
