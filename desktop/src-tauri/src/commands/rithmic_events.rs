//! Push-based event emitter that forwards every updated FootprintBar
//! coming out of the engine to the React webview as a
//! `"footprint-update"` Tauri event.
//!
//! Spawned once at app startup. It survives across login/logout cycles
//! because it subscribes to the long-lived shared engine — only the
//! adapter (the upstream of the tick stream) gets recreated.
//!
//! NOTE: spawning from inside Tauri's `setup` hook means we're not in
//! a Tokio runtime context yet, so we use `tauri::async_runtime::spawn`
//! (which routes through Tauri's managed handle) instead of
//! `tokio::spawn`. The latter panics with "there is no reactor running".

use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;

use crate::engine::FootprintEngine;

const FOOTPRINT_UPDATE_EVENT: &str = "footprint-update";

pub fn spawn_emitter(app: AppHandle, engine: &FootprintEngine) {
    let mut update_rx = engine.updates();
    async_runtime::spawn(async move {
        tracing::info!("Footprint event emitter started");
        loop {
            match update_rx.recv().await {
                Ok(bar) => {
                    if let Err(e) = app.emit(FOOTPRINT_UPDATE_EVENT, &bar) {
                        tracing::warn!(
                            "Failed to emit {}: {e}",
                            FOOTPRINT_UPDATE_EVENT
                        );
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Footprint emitter lagged, dropped {n} updates");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Engine update channel closed, emitter exiting");
                    break;
                }
            }
        }
    });
}
