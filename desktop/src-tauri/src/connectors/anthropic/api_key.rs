//! Keyring vault for the Anthropic API key.
//! One entry, key stored as plain string (no JSON wrap needed — single value).

use crate::connectors::anthropic::error::{AnthropicError, Result};

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "anthropic_api_key_v1";

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, ACCOUNT)?)
}

pub fn save(api_key: &str) -> Result<()> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err(AnthropicError::NoApiKey);
    }
    entry()?.set_password(trimmed)?;
    Ok(())
}

pub fn load() -> Result<Option<String>> {
    match entry()?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AnthropicError::Keyring(e)),
    }
}

pub fn delete() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AnthropicError::Keyring(e)),
    }
}
