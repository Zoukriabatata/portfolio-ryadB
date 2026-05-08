//! Push-based event emitter that forwards every updated FootprintBar
//! coming out of the engine to the React webview as a
//! `"footprint-update"` Tauri event.
//!
//! Spawned once at app startup. It survives across login/logout cycles
//! because it subscribes to the long-lived shared engine — only the
//! adapter (the upstream of the tick stream) gets recreated.

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;

use crate::engine::FootprintEngine;

const FOOTPRINT_UPDATE_EVENT: &str = "footprint-update";

pub fn spawn_emitter(app: AppHandle, engine: &FootprintEngine) {
    let mut update_rx = engine.updates();
    tokio::spawn(async move {
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
