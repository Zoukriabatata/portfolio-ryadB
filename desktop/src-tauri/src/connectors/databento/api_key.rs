//! Encrypted OS-keyring storage for the Databento API key.

use crate::connectors::alpaca::error::{AlpacaError, Result};

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "databento_api_key_v1";

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

pub fn save(api_key: &str) -> Result<()> {
    entry()?.set_password(api_key)?;
    Ok(())
}

pub fn load() -> Result<Option<String>> {
    match entry()?.get_password() {
        Ok(k) if !k.is_empty() => Ok(Some(k)),
        Ok(_) => Ok(None),
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
