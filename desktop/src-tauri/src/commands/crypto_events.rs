//! Phase B / M3 — push-based event emitter for the crypto-side
//! FootprintEngine. Symmetric to `commands::rithmic_events` but
//! routes the long-lived `CryptoState.engine` updates to a separate
//! Tauri event channel so the React side can disambiguate sources.
//!
//! Spawned once at app startup, before any adapter exists. The
//! engine outlives any single connect/disconnect cycle, so this
//! task only stops if the engine's broadcast channel is dropped
//! (which doesn't happen during normal operation).

use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;

use crate::engine::FootprintEngine;

const CRYPTO_FOOTPRINT_UPDATE_EVENT: &str = "crypto-footprint-update";

pub fn spawn_emitter(app: AppHandle, engine: &FootprintEngine) {
    let mut update_rx = engine.updates();
    async_runtime::spawn(async move {
        tracing::info!("Crypto footprint event emitter started");
        loop {
            match update_rx.recv().await {
                Ok(bar) => {
                    if let Err(e) = app.emit(CRYPTO_FOOTPRINT_UPDATE_EVENT, &bar) {
                        tracing::warn!(
                            "Failed to emit {}: {e}",
                            CRYPTO_FOOTPRINT_UPDATE_EVENT
                        );
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Crypto footprint emitter lagged, dropped {n} updates");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Crypto engine update channel closed, emitter exiting");
                    break;
                }
            }
        }
    });
}
