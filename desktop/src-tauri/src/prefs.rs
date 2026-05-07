//! Persisted UI prefs. Plaintext JSON file in the app data dir, kept
//! separate from session.json so that logging out (which deletes
//! session.json) doesn't reset the welcome-screen-dismissed flag.
//!
//! Single field for the MVP. Migrate to tauri-plugin-store if more are
//! added later.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use tokio::fs;

const PREFS_FILE: &str = "prefs.json";

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Prefs {
    #[serde(default, rename = "firstLaunchCompleted")]
    pub first_launch_completed: bool,
}

#[derive(Debug, Error)]
pub enum PrefsError {
    #[error("could not write prefs: {0}")]
    Write(String),
}

impl serde::Serialize for PrefsError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

fn prefs_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join(PREFS_FILE)
}

/// Tolerant load — any IO/parse error returns the default (welcome shown).
/// Better to occasionally re-show the welcome than to crash on a malformed file.
pub async fn load_prefs(data_dir: &PathBuf) -> Prefs {
    let path = prefs_path(data_dir);
    if !path.exists() {
        return Prefs::default();
    }
    match fs::read(&path).await {
        Ok(bytes) => serde_json::from_slice::<Prefs>(&bytes).unwrap_or_default(),
        Err(_) => Prefs::default(),
    }
}

pub async fn mark_first_launch_completed(data_dir: &PathBuf) -> Result<(), PrefsError> {
    let mut prefs = load_prefs(data_dir).await;
    if prefs.first_launch_completed {
        return Ok(());
    }
    prefs.first_launch_completed = true;
    fs::create_dir_all(data_dir)
        .await
        .map_err(|e| PrefsError::Write(e.to_string()))?;
    let json = serde_json::to_vec_pretty(&prefs).map_err(|e| PrefsError::Write(e.to_string()))?;
    fs::write(prefs_path(data_dir), json)
        .await
        .map_err(|e| PrefsError::Write(e.to_string()))
}
