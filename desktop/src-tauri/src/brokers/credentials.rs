//! Broker credential types.
//!
//! `BrokerCredentials` is the full record persisted to the encrypted
//! vault. `BrokerCredentialsRedacted` is the projection sent to the
//! React frontend — it carries everything the UI needs (so the
//! settings panel can re-display gateway/system/username) but never
//! the plaintext password.

use serde::{Deserialize, Serialize};

/// Stable identifier for a broker / data-vendor preset. Used as a
/// dropdown value in the UI and dictates the default values for
/// `gateway_url` and `system_name`. The actual values can be
/// overridden by the user (e.g. when a prop firm sends a custom
/// gateway URL by email at onboarding).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum BrokerPreset {
    /// Rithmic UAT — throttled test data, dev only. Confirmed via
    /// the Phase 7.7.3 investigation (see
    /// docs/RITHMIC_DATA_INVESTIGATION_2026-05-08.md).
    RithmicTest,
    /// Rithmic Paper Trading retail — typically real(-ish) live data
    /// with simulated orders.
    RithmicPaperTrading,
    /// Rithmic 01 retail live — paid direct retail account via FCM.
    Rithmic01,
    /// Apex Trader Funding — funded challenge.
    Apex,
    /// MyFundedFutures — funded challenge.
    MyFundedFutures,
    /// BluSky — funded challenge.
    BluSky,
    /// Bulenox — funded challenge.
    Bulenox,
    /// Take Profit Trader — eval vs PRO+ funded routes through
    /// different system_names.
    TakeProfitTrader,
    /// 4PropTrader — funded challenge.
    FourPropTrader,
    /// Topstep — funded challenge with a dedicated system.
    Topstep,
    /// User-defined: gateway URL and system_name are entered manually.
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerCredentials {
    pub preset: BrokerPreset,
    pub gateway_url: String,
    pub system_name: String,
    pub username: String,
    /// Plaintext password. Only ever lives in memory or inside the
    /// encrypted vault — never written to a regular file, never sent
    /// to the frontend, never logged. Tagged `#[serde(skip)]` on the
    /// redacted projection so it can't accidentally be serialized
    /// into an IPC response.
    pub password: String,
}

/// Frontend-safe projection of `BrokerCredentials` — same shape minus
/// the password. The boolean `has_password` lets the UI know whether
/// the saved record carries a password (so it can render `••••••••`
/// rather than an empty input).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerCredentialsRedacted {
    pub preset: BrokerPreset,
    pub gateway_url: String,
    pub system_name: String,
    pub username: String,
    pub has_password: bool,
}

impl From<&BrokerCredentials> for BrokerCredentialsRedacted {
    fn from(c: &BrokerCredentials) -> Self {
        Self {
            preset: c.preset,
            gateway_url: c.gateway_url.clone(),
            system_name: c.system_name.clone(),
            username: c.username.clone(),
            has_password: !c.password.is_empty(),
        }
    }
}
