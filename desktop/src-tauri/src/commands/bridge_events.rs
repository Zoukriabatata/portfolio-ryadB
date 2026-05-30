//! Push-based emitter for bridge connection-state changes.
//!
//! The reader task broadcasts `BridgeConnState` events as it
//! transitions through Connecting → ReceivingHistory → Live →
//! Reconnecting. We forward each one to the React side as a
//! `bridge-state` Tauri event so the UI can render a progress bar
//! during the historical replay and a banner during reconnection.
//!
//! Unlike `footprint-update` (which is keyed on the long-lived
//! engine), this emitter is keyed on a per-session adapter — when
//! `bridge_disconnect` runs, we abort the JoinHandle.

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::task::JoinHandle;

use crate::connectors::bridge::BridgeConnState;

const STATE_EVENT: &str = "bridge-state";

pub fn spawn_state_emitter(
    app: AppHandle,
    mut rx: Receiver<BridgeConnState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Bridge state emitter started");
        loop {
            match rx.recv().await {
                Ok(state) => {
                    if let Err(e) = app.emit(STATE_EVENT, &state) {
                        tracing::warn!("Failed to emit {}: {e}", STATE_EVENT);
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Bridge state emitter lagged, dropped {n}");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Bridge state channel closed, emitter exiting");
                    break;
                }
            }
        }
    })
}
