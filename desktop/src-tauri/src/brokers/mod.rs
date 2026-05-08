//! Broker configuration & credential storage.
//!
//! This module owns:
//!   - the static catalogue of supported broker / data-vendor presets
//!     (`presets.rs`),
//!   - the credential type that ties a preset to user-entered values
//!     (`credentials.rs`),
//!   - the encrypted vault that persists those credentials between
//!     launches (`vault.rs`, added in Phase 7.7.4 commit 2).

pub mod credentials;
pub mod presets;
pub mod vault;

pub use credentials::{BrokerCredentials, BrokerCredentialsRedacted, BrokerPreset};
pub use presets::{all_presets, preset_info, PresetInfo};
