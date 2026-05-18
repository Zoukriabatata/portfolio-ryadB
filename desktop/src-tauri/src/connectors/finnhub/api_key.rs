//! Encrypted vault for the Finnhub API key. Mirrors the pattern of
//! `brokers::vault` but with its own keyring account so the two
//! credentials stay logically separate (a user can clear one without
//! touching the other).

use crate::connectors::finnhub::error::{FinnhubError, Result};

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "finnhub_api_key_v1";

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

pub fn save(api_key: &str) -> Result<()> {
    entry()?.set_password(api_key)?;
    Ok(())
}

pub fn load() -> Result<Option<String>> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(FinnhubError::Keyring(e)),
    }
}

pub fn delete() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(FinnhubError::Keyring(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn roundtrip() {
        save("test-key-xyz").expect("save");
        let loaded = load().expect("load").expect("Some");
        assert_eq!(loaded, "test-key-xyz");
        delete().expect("delete");
        assert!(load().expect("load").is_none());
    }
}
