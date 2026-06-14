//! Push-based emitter for Quantower bridge connection-state changes.
//! Mirror of bridge_events.rs — same logic, different event name.

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::task::JoinHandle;

use crate::connectors::bridge::BridgeConnState;

const STATE_EVENT: &str = "quantower-state";

pub fn spawn_state_emitter(
    app: AppHandle,
    mut rx: Receiver<BridgeConnState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Quantower state emitter started");
        loop {
            match rx.recv().await {
                Ok(state) => {
                    if let Err(e) = app.emit(STATE_EVENT, &state) {
                        tracing::warn!("Failed to emit {}: {e}", STATE_EVENT);
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Quantower state emitter lagged, dropped {n}");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Quantower state channel closed, emitter exiting");
                    break;
                }
            }
        }
    })
}
