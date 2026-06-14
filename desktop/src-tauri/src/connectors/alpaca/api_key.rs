//! Encrypted vault for the Alpaca KEY_ID + SECRET_KEY pair.
//! Both stored as JSON in a single keyring entry to keep the vault
//! surface minimal.

use serde::{Deserialize, Serialize};

use crate::connectors::alpaca::error::{AlpacaError, Result};

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "alpaca_api_keys_v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaKeys {
    pub key_id: String,
    pub secret_key: String,
    /// True when the user has the Alpaca OPRA paid tier (real-time options data).
    /// Stored in-band in the same keyring JSON so existing entries (no field)
    /// deserialise as false without migration.
    #[serde(default)]
    pub opra: bool,
}

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

pub fn save(keys: &AlpacaKeys) -> Result<()> {
    let json = serde_json::to_string(keys)
        .map_err(|e| AlpacaError::Decode(format!("serialize keys: {e}")))?;
    entry()?.set_password(&json)?;
    Ok(())
}

pub fn load() -> Result<Option<AlpacaKeys>> {
    match entry()?.get_password() {
        Ok(json) => {
            let keys: AlpacaKeys = serde_json::from_str(&json)
                .map_err(|e| AlpacaError::Decode(format!("parse stored keys: {e}")))?;
            Ok(Some(keys))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AlpacaError::Keyring(e)),
    }
}

pub fn delete() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AlpacaError::Keyring(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn roundtrip() {
        let keys = AlpacaKeys {
            key_id: "PKTEST123".into(),
            secret_key: "SECRETXYZ".into(),
            opra: false,
        };
        save(&keys).expect("save");
        let loaded = load().expect("load").expect("Some");
        assert_eq!(loaded.key_id, "PKTEST123");
        assert_eq!(loaded.secret_key, "SECRETXYZ");
        delete().expect("delete");
        assert!(load().expect("load").is_none());
    }
}
