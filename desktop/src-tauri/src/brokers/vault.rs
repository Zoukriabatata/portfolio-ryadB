//! Encrypted vault for broker credentials.
//!
//! Backed by the OS-native credential manager via the `keyring`
//! crate:
//!   - Windows : Credential Manager (DPAPI under the hood)
//!   - macOS   : Keychain
//!   - Linux   : libsecret / Secret Service
//!
//! All three encrypt at rest and isolate per-user without us having
//! to manage a snapshot password ourselves. The full
//! `BrokerCredentials` record is JSON-serialized into a single
//! keyring entry — including the public fields (gateway, system,
//! username) so a single read returns everything the connector needs
//! and we don't end up with a half-encrypted state.
//!
//! Storage key:
//!   service = "OrderflowV2"
//!   account = "broker_credentials_v1"
//!
//! The `_v1` suffix is the schema version so we can introduce a
//! migration later (e.g. when supporting multiple brokers
//! simultaneously) without colliding with the existing entry.

use thiserror::Error;

use crate::brokers::credentials::BrokerCredentials;

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "broker_credentials_v1";

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("keyring backend error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("vault payload could not be decoded: {0}")]
    Decode(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, VaultError>;

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

/// Persist credentials. Overwrites any existing record.
pub fn save(creds: &BrokerCredentials) -> Result<()> {
    let json = serde_json::to_string(creds)?;
    entry()?.set_password(&json)?;
    Ok(())
}

/// Read credentials. Returns `Ok(None)` if no record exists yet —
/// callers should treat that as "user hasn't configured a broker
/// yet" rather than as an error.
pub fn load() -> Result<Option<BrokerCredentials>> {
    match entry()?.get_password() {
        Ok(json) => Ok(Some(serde_json::from_str(&json)?)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Delete the stored record. No-op (returns `Ok(())`) if nothing was
/// stored.
pub fn delete() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brokers::credentials::BrokerPreset;

    /// Smoke-test the save → load → delete cycle. Marked
    /// `#[ignore]` because keyring tests touch the real OS vault and
    /// would race / pollute developer machines if run as part of the
    /// default suite. Run explicitly via:
    ///   cargo test -p desktop --lib brokers::vault::tests -- --ignored
    #[test]
    #[ignore]
    fn roundtrip() {
        let creds = BrokerCredentials {
            preset: BrokerPreset::RithmicTest,
            gateway_url: "wss://example.invalid".into(),
            system_name: "Rithmic Test".into(),
            username: "vault_test_user".into(),
            password: "vault_test_password".into(),
        };
        save(&creds).expect("save");
        let loaded = load().expect("load").expect("Some");
        assert_eq!(loaded.username, creds.username);
        assert_eq!(loaded.password, creds.password);
        delete().expect("delete");
        assert!(load().expect("load").is_none());
    }
}
