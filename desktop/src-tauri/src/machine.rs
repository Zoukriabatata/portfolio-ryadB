//! Hardware fingerprint sourced from the OS-level machine UUID.
//!
//! On Windows we read the machine GUID from the registry, on macOS the
//! IOPlatformUUID, on Linux /etc/machine-id. The `machine-uid` crate
//! handles all three. The result is stable across reboots and survives
//! app reinstalls — exactly what we need to recognise the same device
//! between desktop logins.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MachineError {
    #[error("could not read machine ID: {0}")]
    Read(String),
}

/// Returns a stable per-machine identifier. Caller should treat it as
/// opaque and forward it to /api/license/login as `machineId`.
pub fn get_machine_id() -> Result<String, MachineError> {
    machine_uid::get().map_err(|e| MachineError::Read(e.to_string()))
}

/// Best-effort OS family string ("windows" | "macos" | "linux"). Sent
/// alongside the machineId so /account can show a human-readable label.
pub fn get_os() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}
