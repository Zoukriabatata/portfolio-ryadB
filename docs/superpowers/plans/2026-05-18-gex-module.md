# GEX Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Gamma Exposure dashboard (SPY + QQQ) backed by Tradier Sandbox — strike-by-strike Net GEX bar chart, key dealer levels (Zero γ / Call Wall / Put Wall), and an IV Smile per expiration.

**Architecture:** New Tradier REST connector (bearer auth, keyring-backed API key). Backend Rust computes Net GEX per strike + Zero/Walls + IV smile from the chains it fetches; cached 15 min. Frontend = single route with header (symbol picker SPY/QQQ + refresh), 3 KPI cards (Zero γ / Call Wall / Put Wall), bar chart canvas (strikes × GEX with walls overlay), IV smile canvas with expiration picker. Same Zustand + polling-hook pattern as the News module.

**Tech Stack:**
- Backend : Rust, `reqwest` (already a dep), `keyring` (already a dep), `thiserror`, `tokio`, `serde`, `tracing`. Reuses `TtlCache` from `connectors/finnhub/cache.rs`.
- Frontend : React 19, TypeScript, Zustand 5, Tauri `invoke` + canvas 2D for charts.
- Spec : `docs/superpowers/specs/2026-05-18-gex-module-design.md`.

**Conventions:**
- Paths are repo-relative (root = `orderflow-v2/`).
- Rust commands run from `desktop/src-tauri/`; npm commands from `desktop/`.
- Stage ONLY the files this task lists. NEVER `git add -A`. The branch has unrelated dirty work.
- Branch: `feat/heatmap-refonte-7`. Do not switch.
- Commit style: `feat(gex): …` / `fix(gex): …`, lowercase scope, imperative.

---

## Task 1: Backend — Tradier module skeleton + error type

**Files:**
- Create: `desktop/src-tauri/src/connectors/tradier/mod.rs`
- Create: `desktop/src-tauri/src/connectors/tradier/error.rs`
- Modify: `desktop/src-tauri/src/connectors/mod.rs` (declare `pub mod tradier;`)

- [ ] **Step 1: Create `tradier/error.rs`**

`desktop/src-tauri/src/connectors/tradier/error.rs`:
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TradierError {
    #[error("Tradier API key not configured — set it in Settings")]
    NoApiKey,

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Tradier unauthorized (HTTP 401) — check your API key")]
    Unauthorized,

    #[error("Tradier rate limited (HTTP 429) — retry later")]
    RateLimited,

    #[error("Tradier upstream error (HTTP {0})")]
    Upstream(u16),

    #[error("Tradier returned unexpected payload: {0}")]
    Decode(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

pub type Result<T> = std::result::Result<T, TradierError>;
```

- [ ] **Step 2: Create `tradier/mod.rs`**

`desktop/src-tauri/src/connectors/tradier/mod.rs`:
```rust
//! Tradier Sandbox REST connector — feeds the GEX module.
//! Bearer-auth on every request; keyring-backed API key.
//! Sandbox URL: https://sandbox.tradier.com/v1/
//! Quota: 60 req/min, 15-min delayed quotes (acceptable for GEX).

pub mod error;

pub use error::{Result, TradierError};
```

- [ ] **Step 3: Declare submodule**

Read `desktop/src-tauri/src/connectors/mod.rs`. Add `pub mod tradier;` alongside other `pub mod ...;` declarations (preserve alphabetical/existing order).

- [ ] **Step 4: Compile check**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors. Dead-code warnings on unused variants are OK — used in later tasks.

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/src/connectors/tradier desktop/src-tauri/src/connectors/mod.rs
git commit -m "feat(gex): scaffold tradier connector module + error type"
```

---

## Task 2: Backend — Tradier HTTP client (bearer auth)

**Files:**
- Create: `desktop/src-tauri/src/connectors/tradier/client.rs`
- Modify: `desktop/src-tauri/src/connectors/tradier/mod.rs`

- [ ] **Step 1: Write the client**

`desktop/src-tauri/src/connectors/tradier/client.rs`:
```rust
//! Thin reqwest wrapper for the Tradier Sandbox REST API.
//! Bearer auth on every request. Maps HTTP status to typed errors.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::connectors::tradier::error::{Result, TradierError};

const BASE_URL: &str = "https://sandbox.tradier.com/v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub struct TradierClient {
    http: reqwest::Client,
    api_key: String,
}

impl TradierClient {
    pub fn new(api_key: String) -> Result<Self> {
        if api_key.trim().is_empty() {
            return Err(TradierError::NoApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, api_key })
    }

    /// GET `BASE_URL/{path}?{query}` with bearer auth + JSON Accept header.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T> {
        let url = format!("{}/{}", BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Accept", "application/json")
            .query(query)
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let text = resp.text().await?;
                serde_json::from_str(&text)
                    .map_err(|e| TradierError::Decode(e.to_string()))
            }
            401 => Err(TradierError::Unauthorized),
            429 => Err(TradierError::RateLimited),
            code => Err(TradierError::Upstream(code)),
        }
    }
}
```

- [ ] **Step 2: Re-export from `mod.rs`**

Update `desktop/src-tauri/src/connectors/tradier/mod.rs`:
```rust
//! Tradier Sandbox REST connector — feeds the GEX module.
//! Bearer-auth on every request; keyring-backed API key.
//! Sandbox URL: https://sandbox.tradier.com/v1/
//! Quota: 60 req/min, 15-min delayed quotes (acceptable for GEX).

pub mod client;
pub mod error;

pub use client::TradierClient;
pub use error::{Result, TradierError};
```

- [ ] **Step 3: Compile**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/connectors/tradier
git commit -m "feat(gex): add tradier HTTP client with bearer auth"
```

---

## Task 3: Backend — Options chain + expirations + quote parsers

**Files:**
- Create: `desktop/src-tauri/src/connectors/tradier/options.rs`
- Modify: `desktop/src-tauri/src/connectors/tradier/mod.rs`

Tradier response shapes (sandbox):
- `GET /markets/options/expirations?symbol=SPY&includeAllRoots=true` → `{"expirations":{"date":["2026-05-30","2026-06-06",...]}}` (or `{"expirations":null}` if empty).
- `GET /markets/options/chains?symbol=SPY&expiration=2026-05-30&greeks=true` → `{"options":{"option":[{strike, option_type, open_interest, greeks:{gamma, delta, smv_vol, mid_iv, bid_iv, ask_iv}}, ...]}}` (or `{"options":null}` if empty).
- `GET /markets/quotes?symbols=SPY` → `{"quotes":{"quote":{symbol, last, prevclose, ...}}}` (when one symbol; an array when multiple).

NOTE on greeks field names: Tradier returns `smv_vol` (computed mid IV used in greek computation). If `smv_vol` is null/missing, fall back to `mid_iv`, then to `bid_iv`/`ask_iv` average. The implementation below handles all three.

- [ ] **Step 1: Define raw payload types + public types**

`desktop/src-tauri/src/connectors/tradier/options.rs`:
```rust
//! Tradier `/markets/options/*` and `/markets/quotes` parsers.
//! All functions take a `TradierClient` and return decoded public types.

use serde::Deserialize;

use crate::connectors::tradier::client::TradierClient;
use crate::connectors::tradier::error::{Result, TradierError};

/// One option leg (call OR put) as exposed to the compute layer.
#[derive(Debug, Clone)]
pub struct OptionLeg {
    pub strike: f64,
    pub open_interest: u64,
    pub gamma: Option<f64>,
    pub iv: Option<f64>,        // implied vol fraction (e.g. 0.18 = 18%)
}

/// One full expiration chain split into calls + puts.
#[derive(Debug, Clone, Default)]
pub struct OptionChain {
    pub expiration: String,
    pub calls: Vec<OptionLeg>,
    pub puts: Vec<OptionLeg>,
}

// ─── Raw Tradier JSON shapes (internal) ─────────────────────────────

#[derive(Debug, Deserialize)]
struct ExpirationsEnvelope {
    expirations: Option<ExpirationsBody>,
}
#[derive(Debug, Deserialize)]
struct ExpirationsBody {
    #[serde(default)]
    date: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ChainsEnvelope {
    options: Option<ChainsBody>,
}
#[derive(Debug, Deserialize)]
struct ChainsBody {
    #[serde(default)]
    option: Vec<RawOption>,
}
#[derive(Debug, Deserialize)]
struct RawOption {
    #[serde(default)]
    strike: f64,
    #[serde(default)]
    option_type: String, // "call" | "put"
    #[serde(default)]
    open_interest: u64,
    greeks: Option<RawGreeks>,
}
#[derive(Debug, Deserialize)]
struct RawGreeks {
    gamma: Option<f64>,
    smv_vol: Option<f64>,
    mid_iv: Option<f64>,
    bid_iv: Option<f64>,
    ask_iv: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct QuoteEnvelope {
    quotes: Option<QuoteBody>,
}
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum QuoteBody {
    Single { quote: SingleQuote },
    None,
}
#[derive(Debug, Deserialize)]
struct SingleQuote {
    #[serde(default)]
    last: Option<f64>,
    #[serde(default)]
    prevclose: Option<f64>,
}

/// Pick best-available IV from the greeks block (smv_vol > mid_iv > avg(bid,ask)).
fn pick_iv(g: &RawGreeks) -> Option<f64> {
    g.smv_vol
        .or(g.mid_iv)
        .or_else(|| match (g.bid_iv, g.ask_iv) {
            (Some(b), Some(a)) => Some((b + a) / 2.0),
            (Some(b), None) => Some(b),
            (None, Some(a)) => Some(a),
            (None, None) => None,
        })
}
```

- [ ] **Step 2: Implement `fetch_expirations` + `fetch_chain` + `fetch_quote`**

Append to the same file:
```rust
pub async fn fetch_expirations(
    client: &TradierClient,
    symbol: &str,
) -> Result<Vec<String>> {
    let env: ExpirationsEnvelope = client
        .get_json(
            "markets/options/expirations",
            &[("symbol", symbol), ("includeAllRoots", "true")],
        )
        .await?;
    Ok(env.expirations.map(|b| b.date).unwrap_or_default())
}

pub async fn fetch_chain(
    client: &TradierClient,
    symbol: &str,
    expiration: &str,
) -> Result<OptionChain> {
    let env: ChainsEnvelope = client
        .get_json(
            "markets/options/chains",
            &[
                ("symbol", symbol),
                ("expiration", expiration),
                ("greeks", "true"),
            ],
        )
        .await?;
    let raw = env.options.map(|b| b.option).unwrap_or_default();
    let mut calls: Vec<OptionLeg> = Vec::new();
    let mut puts: Vec<OptionLeg> = Vec::new();
    for o in raw {
        let leg = OptionLeg {
            strike: o.strike,
            open_interest: o.open_interest,
            gamma: o.greeks.as_ref().and_then(|g| g.gamma),
            iv: o.greeks.as_ref().and_then(pick_iv),
        };
        match o.option_type.as_str() {
            "call" => calls.push(leg),
            "put" => puts.push(leg),
            _ => {} // ignore unknown option types
        }
    }
    Ok(OptionChain { expiration: expiration.to_string(), calls, puts })
}

pub async fn fetch_quote(client: &TradierClient, symbol: &str) -> Result<f64> {
    let env: QuoteEnvelope = client
        .get_json("markets/quotes", &[("symbols", symbol)])
        .await?;
    let q = match env.quotes {
        Some(QuoteBody::Single { quote }) => quote,
        _ => return Err(TradierError::Decode("missing quote body".into())),
    };
    q.last
        .or(q.prevclose)
        .ok_or_else(|| TradierError::Decode("quote missing last+prevclose".into()))
}
```

- [ ] **Step 3: Add tests**

Append at bottom of `options.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_iv_prefers_smv_then_mid_then_avg() {
        let g = RawGreeks {
            gamma: None,
            smv_vol: Some(0.18),
            mid_iv: Some(0.20),
            bid_iv: Some(0.19),
            ask_iv: Some(0.21),
        };
        assert_eq!(pick_iv(&g), Some(0.18));

        let g = RawGreeks {
            gamma: None,
            smv_vol: None,
            mid_iv: Some(0.20),
            bid_iv: None,
            ask_iv: None,
        };
        assert_eq!(pick_iv(&g), Some(0.20));

        let g = RawGreeks {
            gamma: None,
            smv_vol: None,
            mid_iv: None,
            bid_iv: Some(0.19),
            ask_iv: Some(0.21),
        };
        assert_eq!(pick_iv(&g), Some(0.20));

        let g = RawGreeks {
            gamma: None, smv_vol: None, mid_iv: None,
            bid_iv: None, ask_iv: None,
        };
        assert_eq!(pick_iv(&g), None);
    }

    #[test]
    fn parses_expirations_envelope() {
        let json = r#"{"expirations":{"date":["2026-05-30","2026-06-06"]}}"#;
        let env: ExpirationsEnvelope = serde_json::from_str(json).unwrap();
        assert_eq!(env.expirations.unwrap().date.len(), 2);
    }

    #[test]
    fn parses_empty_expirations_null() {
        let env: ExpirationsEnvelope =
            serde_json::from_str(r#"{"expirations":null}"#).unwrap();
        assert!(env.expirations.is_none());
    }

    #[test]
    fn parses_chains_envelope_separates_calls_puts() {
        let json = r#"{"options":{"option":[
            {"strike":500.0,"option_type":"call","open_interest":1234,
             "greeks":{"gamma":0.012,"smv_vol":0.18}},
            {"strike":500.0,"option_type":"put","open_interest":2345,
             "greeks":{"gamma":0.011,"smv_vol":0.20}}
        ]}}"#;
        let env: ChainsEnvelope = serde_json::from_str(json).unwrap();
        let body = env.options.unwrap();
        assert_eq!(body.option.len(), 2);
        let call = body.option.iter().find(|o| o.option_type == "call").unwrap();
        assert_eq!(call.strike, 500.0);
        assert_eq!(call.open_interest, 1234);
        assert_eq!(call.greeks.as_ref().unwrap().gamma, Some(0.012));
    }
}
```

- [ ] **Step 4: Re-export from `mod.rs`**

Add to `desktop/src-tauri/src/connectors/tradier/mod.rs`:
```rust
pub mod options;

pub use options::{fetch_chain, fetch_expirations, fetch_quote, OptionChain, OptionLeg};
```

- [ ] **Step 5: Run tests**

```bash
cd desktop/src-tauri && cargo test --lib connectors::tradier::options
```
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add desktop/src-tauri/src/connectors/tradier
git commit -m "feat(gex): tradier options + quote parsers"
```

---

## Task 4: Backend — API key vault (keyring)

**Files:**
- Create: `desktop/src-tauri/src/connectors/tradier/api_key.rs`
- Modify: `desktop/src-tauri/src/connectors/tradier/mod.rs`

Mirror of `desktop/src-tauri/src/connectors/finnhub/api_key.rs` (different `ACCOUNT`).

- [ ] **Step 1: Implement the vault**

`desktop/src-tauri/src/connectors/tradier/api_key.rs`:
```rust
//! Encrypted vault for the Tradier API key. Mirrors the Finnhub
//! vault — separate keyring account so the two credentials stay
//! logically independent.

use crate::connectors::tradier::error::{Result, TradierError};

const SERVICE: &str = "OrderflowV2";
const ACCOUNT: &str = "tradier_api_key_v1";

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
        Err(e) => Err(TradierError::Keyring(e)),
    }
}

pub fn delete() -> Result<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(TradierError::Keyring(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn roundtrip() {
        save("test-tradier-xyz").expect("save");
        let loaded = load().expect("load").expect("Some");
        assert_eq!(loaded, "test-tradier-xyz");
        delete().expect("delete");
        assert!(load().expect("load").is_none());
    }
}
```

- [ ] **Step 2: Declare module**

Add to `desktop/src-tauri/src/connectors/tradier/mod.rs`:
```rust
pub mod api_key;
```

- [ ] **Step 3: Compile**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/connectors/tradier
git commit -m "feat(gex): keyring-backed tradier api key vault"
```

---

## Task 5: Backend — GEX compute + IV smile

**Files:**
- Create: `desktop/src-tauri/src/connectors/tradier/gex.rs`
- Modify: `desktop/src-tauri/src/connectors/tradier/mod.rs`

The compute function is **pure** — takes already-fetched chains, produces a snapshot. The Tauri command orchestrates the fetch separately (Task 6).

- [ ] **Step 1: Types**

`desktop/src-tauri/src/connectors/tradier/gex.rs`:
```rust
//! Pure GEX compute: aggregate per strike across expirations, derive
//! Zero Gamma / Call Wall / Put Wall, and extract an OTM-only IV
//! smile per expiration from the same chains.
//!
//! Convention (SpotGamma-style, ETF multiplier = 100):
//!   gex_call_strike = OI × gamma × 100 × spot² × 0.01
//!   gex_put_strike  = -OI × gamma × 100 × spot² × 0.01
//!   net_gex_strike  = sum across all expirations
//!   zero_gamma      = strike where cumulative-from-bottom net_gex
//!                     crosses 0 (linear interpolation)
//!   call_wall       = strike > spot with max net_gex (call-dominant)
//!   put_wall        = strike < spot with min net_gex (put-dominant)

use std::collections::BTreeMap;

use serde::Serialize;

use crate::connectors::tradier::options::OptionChain;

const MULTIPLIER: f64 = 100.0; // SPY / QQQ ETF options

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexSnapshot {
    pub symbol: String,
    pub spot: f64,
    pub computed_at: String,
    pub expiration_count: u32,
    pub strikes: Vec<GexStrike>,
    pub zero_gamma: Option<f64>,
    pub call_wall: Option<f64>,
    pub put_wall: Option<f64>,
    pub total_gex: f64,
    pub stale: bool,
    pub iv_smiles: Vec<IvSmile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexStrike {
    pub strike: f64,
    pub call_gex: f64,
    pub put_gex: f64,
    pub net_gex: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvSmile {
    pub expiration: String,
    pub days_to_expiry: u32,
    pub points: Vec<IvPoint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvPoint {
    pub strike: f64,
    pub iv: f64,
    pub side: IvSide,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IvSide { Put, Call }
```

- [ ] **Step 2: Helper — days_to_expiry**

Append to the same file:
```rust
/// Days from `today_unix_secs` until `expiration` (ISO "YYYY-MM-DD").
/// Returns 0 if expiration is unparseable or in the past.
fn days_to_expiry(today_unix_secs: i64, expiration: &str) -> u32 {
    let parts: Vec<&str> = expiration.split('-').collect();
    if parts.len() != 3 { return 0; }
    let y: i32 = parts[0].parse().unwrap_or(0);
    let m: u32 = parts[1].parse().unwrap_or(0);
    let d: u32 = parts[2].parse().unwrap_or(0);
    if y == 0 || m == 0 || d == 0 { return 0; }
    // Hinnant days_from_civil
    let yc = if m <= 2 { y - 1 } else { y };
    let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
    let yoe = (yc - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era as i64 * 146_097 + doe as i64 - 719_468;
    let expiry_secs = days * 86_400;
    let diff = expiry_secs - today_unix_secs;
    if diff <= 0 { 0 } else { (diff / 86_400) as u32 }
}
```

- [ ] **Step 3: Main compute fn**

Append to the same file:
```rust
/// Build a `GexSnapshot` from the symbol + spot + a list of
/// (expiration, chain) pairs. Pure function — no I/O.
pub fn compute_gex(
    symbol: &str,
    spot: f64,
    chains: &[OptionChain],
    computed_at: String,
    today_unix_secs: i64,
) -> GexSnapshot {
    let spot_sq = spot * spot;
    let mut by_strike: BTreeMap<u64, (f64, f64)> = BTreeMap::new(); // strike_key → (call_gex, put_gex)
    let mut iv_smiles: Vec<IvSmile> = Vec::with_capacity(chains.len());

    // Strike keys as u64 of (strike * 1000) so BTreeMap orders properly
    // and avoids f64 hashing.
    let key = |s: f64| -> u64 { (s * 1000.0).round() as u64 };

    for chain in chains {
        // ─── GEX aggregation ───
        for c in &chain.calls {
            if let Some(g) = c.gamma {
                let contribution = c.open_interest as f64 * g * MULTIPLIER * spot_sq * 0.01;
                by_strike.entry(key(c.strike)).or_insert((0.0, 0.0)).0 += contribution;
            }
        }
        for p in &chain.puts {
            if let Some(g) = p.gamma {
                let contribution = -(p.open_interest as f64) * g * MULTIPLIER * spot_sq * 0.01;
                by_strike.entry(key(p.strike)).or_insert((0.0, 0.0)).1 += contribution;
            }
        }

        // ─── IV smile (OTM-only) ───
        let mut points: Vec<IvPoint> = Vec::new();
        // Build a strike → leg map for fast lookup.
        let mut puts_by_k: BTreeMap<u64, &super::options::OptionLeg> = BTreeMap::new();
        for p in &chain.puts { puts_by_k.insert(key(p.strike), p); }
        let mut calls_by_k: BTreeMap<u64, &super::options::OptionLeg> = BTreeMap::new();
        for c in &chain.calls { calls_by_k.insert(key(c.strike), c); }
        // Union of strikes.
        let mut all_strikes: Vec<u64> = puts_by_k.keys().chain(calls_by_k.keys()).copied().collect();
        all_strikes.sort();
        all_strikes.dedup();
        for k in all_strikes {
            let strike = k as f64 / 1000.0;
            if strike < spot {
                if let Some(p) = puts_by_k.get(&k) {
                    if let Some(iv) = p.iv {
                        points.push(IvPoint { strike, iv, side: IvSide::Put });
                    }
                }
            } else {
                if let Some(c) = calls_by_k.get(&k) {
                    if let Some(iv) = c.iv {
                        points.push(IvPoint { strike, iv, side: IvSide::Call });
                    }
                }
            }
        }
        iv_smiles.push(IvSmile {
            expiration: chain.expiration.clone(),
            days_to_expiry: days_to_expiry(today_unix_secs, &chain.expiration),
            points,
        });
    }

    let mut strikes: Vec<GexStrike> = by_strike
        .into_iter()
        .map(|(k, (call_gex, put_gex))| GexStrike {
            strike: k as f64 / 1000.0,
            call_gex,
            put_gex,
            net_gex: call_gex + put_gex,
        })
        .collect();
    strikes.sort_by(|a, b| a.strike.partial_cmp(&b.strike).unwrap_or(std::cmp::Ordering::Equal));

    let total_gex: f64 = strikes.iter().map(|s| s.net_gex).sum();

    // Zero Gamma — strike where cumulative (bottom→up) crosses zero.
    let mut zero_gamma: Option<f64> = None;
    let mut cumul = 0.0;
    let mut prev: Option<(f64, f64)> = None; // (strike, cumul_before)
    for s in &strikes {
        let next_cumul = cumul + s.net_gex;
        if let Some((prev_strike, prev_cumul)) = prev {
            if (prev_cumul <= 0.0 && next_cumul >= 0.0) || (prev_cumul >= 0.0 && next_cumul <= 0.0) {
                // Linear interp between (prev_strike, prev_cumul) and (s.strike, next_cumul).
                let denom = next_cumul - prev_cumul;
                let zg = if denom.abs() < 1e-9 {
                    s.strike
                } else {
                    prev_strike + (s.strike - prev_strike) * (-prev_cumul) / denom
                };
                zero_gamma = Some(zg);
                break;
            }
        }
        prev = Some((s.strike, next_cumul));
        cumul = next_cumul;
    }

    // Call Wall = strike > spot with max net_gex (positive). Put Wall = strike < spot with min (negative).
    let call_wall = strikes
        .iter()
        .filter(|s| s.strike > spot && s.net_gex > 0.0)
        .max_by(|a, b| a.net_gex.partial_cmp(&b.net_gex).unwrap_or(std::cmp::Ordering::Equal))
        .map(|s| s.strike);
    let put_wall = strikes
        .iter()
        .filter(|s| s.strike < spot && s.net_gex < 0.0)
        .min_by(|a, b| a.net_gex.partial_cmp(&b.net_gex).unwrap_or(std::cmp::Ordering::Equal))
        .map(|s| s.strike);

    GexSnapshot {
        symbol: symbol.to_string(),
        spot,
        computed_at,
        expiration_count: chains.len() as u32,
        strikes,
        zero_gamma,
        call_wall,
        put_wall,
        total_gex,
        stale: false,
        iv_smiles,
    }
}
```

- [ ] **Step 4: Tests**

Append at the bottom:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::tradier::options::{OptionChain, OptionLeg};

    fn leg(strike: f64, oi: u64, gamma: Option<f64>, iv: Option<f64>) -> OptionLeg {
        OptionLeg { strike, open_interest: oi, gamma, iv }
    }

    #[test]
    fn put_gex_is_negative_call_gex_is_positive() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![leg(500.0, 1000, Some(0.01), Some(0.18))],
            puts:  vec![leg(500.0, 1000, Some(0.01), Some(0.20))],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "2026-05-18T12:00:00Z".into(), 1779451200);
        assert_eq!(snap.strikes.len(), 1);
        assert!(snap.strikes[0].call_gex > 0.0);
        assert!(snap.strikes[0].put_gex < 0.0);
    }

    #[test]
    fn call_wall_is_strike_above_spot_with_max_net_gex() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![
                leg(500.0, 1000, Some(0.01), None),
                leg(510.0, 5000, Some(0.01), None),  // call-heavy strike > spot
                leg(520.0, 500, Some(0.01), None),
            ],
            puts: vec![],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.call_wall, Some(510.0));
    }

    #[test]
    fn put_wall_is_strike_below_spot_with_min_net_gex() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![],
            puts: vec![
                leg(495.0, 500, Some(0.01), None),
                leg(490.0, 5000, Some(0.01), None), // put-heavy strike < spot
                leg(485.0, 1000, Some(0.01), None),
            ],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.put_wall, Some(490.0));
    }

    #[test]
    fn iv_smile_uses_put_below_spot_call_above_spot() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![
                leg(495.0, 100, Some(0.01), Some(0.25)), // < spot — IGNORED (use put)
                leg(505.0, 100, Some(0.01), Some(0.18)), // > spot — used
            ],
            puts: vec![
                leg(495.0, 100, Some(0.01), Some(0.22)), // < spot — used
                leg(505.0, 100, Some(0.01), Some(0.30)), // > spot — IGNORED (use call)
            ],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.iv_smiles.len(), 1);
        let pts = &snap.iv_smiles[0].points;
        let p495 = pts.iter().find(|p| (p.strike - 495.0).abs() < 0.01).unwrap();
        assert!(matches!(p495.side, IvSide::Put));
        assert!((p495.iv - 0.22).abs() < 1e-9);
        let p505 = pts.iter().find(|p| (p.strike - 505.0).abs() < 0.01).unwrap();
        assert!(matches!(p505.side, IvSide::Call));
        assert!((p505.iv - 0.18).abs() < 1e-9);
    }
}
```

- [ ] **Step 5: Re-export from `mod.rs`**

Add to `desktop/src-tauri/src/connectors/tradier/mod.rs`:
```rust
pub mod gex;

pub use gex::{compute_gex, GexSnapshot, GexStrike, IvPoint, IvSide, IvSmile};
```

- [ ] **Step 6: Run tests**

```bash
cd desktop/src-tauri && cargo test --lib connectors::tradier::gex
```
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add desktop/src-tauri/src/connectors/tradier
git commit -m "feat(gex): pure compute (net gex + walls + zero gamma + iv smile)"
```

---

## Task 6: Backend — Tauri commands + state + wiring

**Files:**
- Create: `desktop/src-tauri/src/commands/gex.rs`
- Modify: `desktop/src-tauri/src/commands/mod.rs`
- Modify: `desktop/src-tauri/src/lib.rs`

The command orchestrates: read key → expirations → filter ≤ 30 days → fetch chains sequentially → fetch quote → compute → cache.

- [ ] **Step 1: Write `commands/gex.rs`**

`desktop/src-tauri/src/commands/gex.rs`:
```rust
//! Tauri commands for the GEX module. One snapshot endpoint plus
//! three API-key endpoints (mirror of the Finnhub key commands).

use std::time::Duration;

use tauri::State;

use crate::connectors::finnhub::TtlCache;
use crate::connectors::tradier::{
    api_key, compute_gex, fetch_chain, fetch_expirations, fetch_quote,
    GexSnapshot, OptionChain, TradierClient,
};

/// 15 min — chains move slowly; this protects the 60 req/min quota
/// from accidental rapid refreshes.
const SNAPSHOT_TTL: Duration = Duration::from_secs(15 * 60);
/// Filter expirations to the next N days (covers 0DTE, weeklies, front
/// monthly). 30 is the standard GEX horizon.
const EXPIRATION_WINDOW_DAYS: i64 = 30;

pub struct GexState {
    pub cache: TtlCache<GexSnapshot>,
}

impl GexState {
    pub fn new() -> Self {
        Self {
            cache: TtlCache::new(SNAPSHOT_TTL),
        }
    }
}

impl Default for GexState {
    fn default() -> Self { Self::new() }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchGexArgs {
    pub symbol: String, // "SPY" | "QQQ"
}

#[tauri::command]
pub async fn gex_fetch_snapshot(
    state: State<'_, GexState>,
    args: FetchGexArgs,
) -> Result<GexSnapshot, String> {
    let cache_key = format!("gex|{}", args.symbol);
    if let Some(mut hit) = state.cache.get(&cache_key).await {
        tracing::info!("gex_fetch_snapshot: cache hit {}", args.symbol);
        hit.stale = false;
        return Ok(hit);
    }

    let api_key_str = tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("tradier vault: {e}"))?
        .ok_or_else(|| "Tradier API key not configured — set it in Settings".to_string())?;
    let client = TradierClient::new(api_key_str).map_err(|e| e.to_string())?;

    // 1. Expirations — keep only those within the window.
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let cutoff_secs = now_secs + EXPIRATION_WINDOW_DAYS * 86_400;
    let expirations = fetch_expirations(&client, &args.symbol)
        .await
        .map_err(|e| format!("expirations: {e}"))?;
    let filtered: Vec<String> = expirations
        .into_iter()
        .filter(|iso| {
            // Reuse the same parser as `gex::days_to_expiry`. Re-implement
            // inline (kept tiny) to avoid pulling it from a private module.
            let parts: Vec<&str> = iso.split('-').collect();
            if parts.len() != 3 { return false; }
            let y: i32 = parts[0].parse().unwrap_or(0);
            let m: u32 = parts[1].parse().unwrap_or(0);
            let d: u32 = parts[2].parse().unwrap_or(0);
            if y == 0 || m == 0 || d == 0 { return false; }
            let yc = if m <= 2 { y - 1 } else { y };
            let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
            let yoe = (yc - era * 400) as u32;
            let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
            let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
            let days = era as i64 * 146_097 + doe as i64 - 719_468;
            let exp_secs = days * 86_400;
            exp_secs >= now_secs && exp_secs <= cutoff_secs
        })
        .collect();
    tracing::info!(
        "gex_fetch_snapshot: {} kept {} expirations (window {} days)",
        args.symbol,
        filtered.len(),
        EXPIRATION_WINDOW_DAYS,
    );

    // 2. Chains — sequential to stay under the rate limit.
    let mut chains: Vec<OptionChain> = Vec::with_capacity(filtered.len());
    for exp in &filtered {
        match fetch_chain(&client, &args.symbol, exp).await {
            Ok(c) => chains.push(c),
            Err(e) => tracing::warn!("gex_fetch_snapshot: chain {} failed: {}", exp, e),
        }
    }

    // 3. Spot.
    let spot = fetch_quote(&client, &args.symbol)
        .await
        .map_err(|e| format!("quote: {e}"))?;

    // 4. Compute.
    let computed_at = unix_to_iso8601(now_secs);
    let snap = compute_gex(&args.symbol, spot, &chains, computed_at, now_secs);
    tracing::info!(
        "gex_fetch_snapshot: {} computed {} strikes, total_gex={:.2}",
        args.symbol,
        snap.strikes.len(),
        snap.total_gex,
    );

    state.cache.set(cache_key, snap.clone()).await;
    Ok(snap)
}

#[tauri::command]
pub async fn gex_save_api_key(key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        return Err("API key is empty".to_string());
    }
    tokio::task::spawn_blocking(move || api_key::save(&trimmed))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gex_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(api_key::load)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gex_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(api_key::delete)
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

fn unix_to_iso8601(unix_secs: i64) -> String {
    if unix_secs <= 0 { return String::new(); }
    let days = unix_secs.div_euclid(86_400);
    let day_secs = unix_secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let h = day_secs / 3600;
    let mi = (day_secs % 3600) / 60;
    let s = day_secs % 60;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d, h, mi, s)
}
```

NOTE: the import `crate::connectors::finnhub::TtlCache` reuses the existing cache module from Finnhub. If for any reason `TtlCache` isn't re-exported at that path, look at `connectors/finnhub/mod.rs` — it should re-export `cache::TtlCache`. If you see "cannot find type TtlCache", adjust the import to `crate::connectors::finnhub::cache::TtlCache`.

- [ ] **Step 2: Declare module + register handlers**

Read `desktop/src-tauri/src/commands/mod.rs` and add `pub mod gex;` near the other `pub mod ...;` declarations (alphabetical).

Read `desktop/src-tauri/src/lib.rs`. Near the existing `commands::news::NewsState::new()` `.manage(...)` call, add:
```rust
.manage(commands::gex::GexState::new())
```

In the `tauri::generate_handler![...]` block, add:
```
commands::gex::gex_fetch_snapshot,
commands::gex::gex_save_api_key,
commands::gex::gex_has_api_key,
commands::gex::gex_delete_api_key,
```

- [ ] **Step 3: Compile + run all tradier tests**

```bash
cd desktop/src-tauri && cargo check && cargo test --lib connectors::tradier
```
Expected: 0 compile errors, all tradier tests pass (4 options + 4 gex = 8 tests).

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/commands desktop/src-tauri/src/lib.rs
git commit -m "feat(gex): expose tauri commands + register GexState"
```

---

## Task 7: Frontend — TS types + invoke wrappers

**Files:**
- Create: `desktop/src/lib/gex/api.ts`

- [ ] **Step 1: Write the wrappers**

`desktop/src/lib/gex/api.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";

export type IvSide = "put" | "call";

export type IvPoint = {
  strike: number;
  iv: number;
  side: IvSide;
};

export type IvSmile = {
  expiration: string;       // ISO date
  daysToExpiry: number;
  points: IvPoint[];        // sorted by strike asc
};

export type GexStrike = {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
};

export type GexSnapshot = {
  symbol: string;
  spot: number;
  computedAt: string;       // ISO 8601 UTC
  expirationCount: number;
  strikes: GexStrike[];     // sorted ascending
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  totalGex: number;
  stale: boolean;
  ivSmiles: IvSmile[];
};

export type GexSymbol = "SPY" | "QQQ";

export async function fetchGexSnapshot(symbol: GexSymbol): Promise<GexSnapshot> {
  return invoke<GexSnapshot>("gex_fetch_snapshot", { args: { symbol } });
}

export async function saveApiKey(key: string): Promise<void> {
  return invoke<void>("gex_save_api_key", { key });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("gex_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("gex_delete_api_key");
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/lib/gex
git commit -m "feat(gex): types + invoke wrappers"
```

---

## Task 8: Frontend — Zustand store

**Files:**
- Create: `desktop/src/lib/gex/useGexStore.ts`

- [ ] **Step 1: Write the store**

`desktop/src/lib/gex/useGexStore.ts`:
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fetchGexSnapshot, type GexSnapshot, type GexSymbol } from "./api";

type GexStoreState = {
  snapshot: GexSnapshot | null;
  symbol: GexSymbol;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  autoRefresh: boolean;
  selectedExpiration: string | null;

  setSymbol: (s: GexSymbol) => Promise<void>;
  fetchSnapshot: () => Promise<void>;
  toggleAutoRefresh: () => void;
  setSelectedExpiration: (iso: string) => void;
};

export const useGexStore = create<GexStoreState>()(
  persist(
    (set, get) => ({
      snapshot: null,
      symbol: "SPY",
      loading: false,
      error: null,
      lastFetchedAt: null,
      autoRefresh: true,
      selectedExpiration: null,

      setSymbol: async (s) => {
        if (s === get().symbol) return;
        set({ symbol: s, snapshot: null, selectedExpiration: null });
        await get().fetchSnapshot();
      },

      fetchSnapshot: async () => {
        set({ loading: true, error: null });
        try {
          const snap = await fetchGexSnapshot(get().symbol);
          // Auto-pick front-month expiration if user hasn't chosen one
          // or if the previous pick isn't in the new snapshot.
          const cur = get().selectedExpiration;
          const stillValid = cur && snap.ivSmiles.some((s) => s.expiration === cur);
          const nextExp = stillValid ? cur : (snap.ivSmiles[0]?.expiration ?? null);
          set({
            snapshot: snap,
            loading: false,
            lastFetchedAt: Date.now(),
            selectedExpiration: nextExp,
          });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),
      setSelectedExpiration: (iso) => set({ selectedExpiration: iso }),
    }),
    {
      name: "orderflow:gex:prefs",
      // Persist only user prefs — data re-fetched at mount.
      partialize: (s) => ({ symbol: s.symbol, autoRefresh: s.autoRefresh }),
      merge: (persisted, current) => {
        const p = (persisted as Partial<GexStoreState>) ?? {};
        return { ...current, ...p };
      },
    },
  ),
);
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/lib/gex
git commit -m "feat(gex): zustand store with persist + expiration auto-pick"
```

---

## Task 9: Frontend — Polling hook

**Files:**
- Create: `desktop/src/lib/gex/useGexPolling.ts`

- [ ] **Step 1: Write the hook**

`desktop/src/lib/gex/useGexPolling.ts`:
```ts
import { useEffect } from "react";
import { useGexStore } from "./useGexStore";

const REFRESH_INTERVAL_MS = 15 * 60_000; // 15 min — matches backend cache TTL

/** Mount once in GexRoute. Triggers an initial fetch then polls every
 *  15 min while the tab is visible and auto-refresh is on. Pauses on
 *  visibility hidden, resumes (with an immediate fetch) on return. */
export function useGexPolling() {
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);
  const autoRefresh = useGexStore((s) => s.autoRefresh);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      stop();
      void fetchSnapshot();
      if (autoRefresh) {
        timer = setInterval(() => void fetchSnapshot(), REFRESH_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [fetchSnapshot, autoRefresh]);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/lib/gex
git commit -m "feat(gex): polling hook with visibility-pause"
```

---

## Task 10: Frontend — GexHeader + GexKeyLevels + base CSS

**Files:**
- Create: `desktop/src/components/gex/gex.css`
- Create: `desktop/src/components/gex/GexHeader.tsx`
- Create: `desktop/src/components/gex/GexKeyLevels.tsx`

- [ ] **Step 1: Base CSS**

`desktop/src/components/gex/gex.css`:
```css
/* Logo-derived green scoped to GEX module — mirrors News/Account
   pattern (#22c55e). Does NOT affect Heatmap/Footprint --brand-green. */
.gex-route {
  --brand-green: #22c55e;
  --brand-green-dim: #166534;

  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 24px;
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.gex-route::-webkit-scrollbar { width: 8px; }
.gex-route::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

/* ─── Header ────────────────────────────────────────────────── */
.gex-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.gex-header-symbol {
  display: flex;
  gap: 6px;
}
.gex-symbol-pill {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 6px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s ease;
}
.gex-symbol-pill:hover {
  border-color: var(--brand-green-dim);
  color: var(--text-primary);
}
.gex-symbol-pill-active {
  background: var(--brand-green);
  border-color: var(--brand-green);
  color: var(--bg-primary);
}
.gex-header-spot {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.gex-header-spot-label {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-right: 8px;
}
.gex-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gex-header-refreshed {
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.gex-refresh-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s ease;
}
.gex-refresh-btn:hover:not(:disabled) {
  background: var(--brand-green);
  color: var(--bg-primary);
  border-color: var(--brand-green);
}
.gex-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gex-auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.04em;
  cursor: pointer;
  user-select: none;
}
.gex-auto-toggle input { accent-color: var(--brand-green); }

/* ─── Key levels ──────────────────────────────────────────── */
.gex-key-levels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.gex-kpi-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}
.gex-kpi-card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--brand-green), transparent);
  opacity: 0.45;
  border-radius: 12px 12px 0 0;
}
.gex-kpi-label {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.gex-kpi-value {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.gex-kpi-sub {
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.gex-kpi-total-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.gex-kpi-total-chip-positive { color: var(--brand-green); border-color: var(--brand-green-dim); }
.gex-kpi-total-chip-negative { color: var(--accent-red); border-color: var(--accent-red-dim); }
```

- [ ] **Step 2: `GexHeader`**

`desktop/src/components/gex/GexHeader.tsx`:
```tsx
import { useGexStore } from "../../lib/gex/useGexStore";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function GexHeader() {
  const symbol = useGexStore((s) => s.symbol);
  const setSymbol = useGexStore((s) => s.setSymbol);
  const snapshot = useGexStore((s) => s.snapshot);
  const loading = useGexStore((s) => s.loading);
  const lastFetchedAt = useGexStore((s) => s.lastFetchedAt);
  const autoRefresh = useGexStore((s) => s.autoRefresh);
  const toggleAutoRefresh = useGexStore((s) => s.toggleAutoRefresh);
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);

  return (
    <div className="gex-header">
      <div className="gex-header-symbol">
        {(["SPY", "QQQ"] as const).map((sym) => (
          <button
            key={sym}
            type="button"
            className={`gex-symbol-pill ${symbol === sym ? "gex-symbol-pill-active" : ""}`}
            onClick={() => void setSymbol(sym)}
            disabled={loading}
          >
            {sym}
          </button>
        ))}
      </div>

      <div>
        <span className="gex-header-spot-label">Spot</span>
        <span className="gex-header-spot">
          {snapshot ? `$${snapshot.spot.toFixed(2)}` : "—"}
        </span>
      </div>

      <div className="gex-header-actions">
        <label className="gex-auto-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={toggleAutoRefresh}
          />
          Auto 15min
        </label>
        <span className="gex-header-refreshed">{timeAgo(lastFetchedAt)}</span>
        <button
          type="button"
          className="gex-refresh-btn"
          onClick={() => void fetchSnapshot()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `GexKeyLevels`**

`desktop/src/components/gex/GexKeyLevels.tsx`:
```tsx
import { useGexStore } from "../../lib/gex/useGexStore";

function fmtGex(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtDistance(level: number | null, spot: number): string {
  if (level === null || !Number.isFinite(level)) return "";
  const diff = level - spot;
  const pct = (diff / spot) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

export function GexKeyLevels() {
  const snapshot = useGexStore((s) => s.snapshot);
  if (!snapshot) {
    return (
      <div className="gex-key-levels">
        <div className="gex-kpi-card"><div className="gex-kpi-label">Zero Gamma</div><div className="gex-kpi-value">—</div></div>
        <div className="gex-kpi-card"><div className="gex-kpi-label">Call Wall</div><div className="gex-kpi-value">—</div></div>
        <div className="gex-kpi-card"><div className="gex-kpi-label">Put Wall</div><div className="gex-kpi-value">—</div></div>
      </div>
    );
  }

  const totalChipClass =
    snapshot.totalGex >= 0
      ? "gex-kpi-total-chip gex-kpi-total-chip-positive"
      : "gex-kpi-total-chip gex-kpi-total-chip-negative";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span className={totalChipClass}>Total GEX · {fmtGex(snapshot.totalGex)}</span>
      </div>
      <div className="gex-key-levels">
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Zero Gamma</div>
          <div className="gex-kpi-value">
            {snapshot.zeroGamma !== null ? `$${snapshot.zeroGamma.toFixed(2)}` : "—"}
          </div>
          <div className="gex-kpi-sub">{fmtDistance(snapshot.zeroGamma, snapshot.spot)}</div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Call Wall</div>
          <div className="gex-kpi-value">
            {snapshot.callWall !== null ? `$${snapshot.callWall.toFixed(2)}` : "—"}
          </div>
          <div className="gex-kpi-sub">{fmtDistance(snapshot.callWall, snapshot.spot)}</div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Put Wall</div>
          <div className="gex-kpi-value">
            {snapshot.putWall !== null ? `$${snapshot.putWall.toFixed(2)}` : "—"}
          </div>
          <div className="gex-kpi-sub">{fmtDistance(snapshot.putWall, snapshot.spot)}</div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/components/gex
git commit -m "feat(gex): GexHeader + GexKeyLevels + base CSS"
```

---

## Task 11: Frontend — GexBarChart canvas

**Files:**
- Create: `desktop/src/components/gex/GexBarChart.tsx`
- Modify: `desktop/src/components/gex/gex.css` (append)

- [ ] **Step 1: Append CSS**

Append to `desktop/src/components/gex/gex.css`:
```css
/* ─── Bar chart ───────────────────────────────────────────── */
.gex-chart-wrap {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gex-chart-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.gex-chart-title::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--brand-green);
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: middle;
  box-shadow: 0 0 6px var(--brand-green);
}
.gex-chart-zoom {
  display: inline-flex;
  gap: 4px;
}
.gex-chart-zoom-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  font-family: inherit;
}
.gex-chart-zoom-btn-active {
  background: var(--brand-green);
  color: var(--bg-primary);
  border-color: var(--brand-green);
}
.gex-chart-canvas {
  width: 100%;
  height: 480px;
  display: block;
}
.gex-chart-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 80px 20px;
  font-style: italic;
}
```

- [ ] **Step 2: `GexBarChart`**

`desktop/src/components/gex/GexBarChart.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";

function fmtGexShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function GexBarChart() {
  const snapshot = useGexStore((s) => s.snapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<"5pct" | "full">("5pct");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot || snapshot.strikes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Filter strikes by zoom.
    const spot = snapshot.spot;
    const visible =
      zoom === "5pct"
        ? snapshot.strikes.filter((s) => Math.abs(s.strike - spot) / spot <= 0.05)
        : snapshot.strikes;
    if (visible.length === 0) return;

    const padL = 60, padR = 20, padT = 20, padB = 40;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    // Symmetric Y axis around 0.
    const maxAbs = Math.max(
      ...visible.map((s) => Math.max(Math.abs(s.callGex), Math.abs(s.putGex))),
      1,
    );
    const yScale = h / (2 * maxAbs);
    const yZero = padT + h / 2;

    // X axis : strikes evenly spaced.
    const strikeMin = visible[0].strike;
    const strikeMax = visible[visible.length - 1].strike;
    const strikeRange = Math.max(0.01, strikeMax - strikeMin);
    const xOf = (strike: number) => padL + ((strike - strikeMin) / strikeRange) * w;
    const barWidth = Math.max(2, w / visible.length * 0.75);

    // Y grid + zero line.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const y = yZero - i * (h / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px system-ui, -apple-system";
      ctx.textAlign = "right";
      ctx.fillText(fmtGexShort(i * maxAbs / 2), padL - 6, y + 3);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(padL + w, yZero);
    ctx.stroke();

    // Bars.
    for (const s of visible) {
      const xCenter = xOf(s.strike);
      // Call gex (positive) — green
      if (s.callGex > 0) {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(
          xCenter - barWidth / 2,
          yZero - s.callGex * yScale,
          barWidth,
          s.callGex * yScale,
        );
      }
      // Put gex (negative) — red
      if (s.putGex < 0) {
        ctx.fillStyle = "#ff3d71";
        ctx.fillRect(
          xCenter - barWidth / 2,
          yZero,
          barWidth,
          -s.putGex * yScale,
        );
      }
    }

    // X axis ticks — every Nth strike.
    const tickEvery = Math.max(1, Math.floor(visible.length / 8));
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "center";
    for (let i = 0; i < visible.length; i += tickEvery) {
      const x = xOf(visible[i].strike);
      ctx.fillText(visible[i].strike.toFixed(0), x, cssH - padB / 2 + 6);
    }

    // Vertical lines: spot, walls, zero gamma.
    const drawVLine = (strike: number | null, color: string, label: string) => {
      if (strike === null || strike < strikeMin || strike > strikeMax) return;
      const x = xOf(strike);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.font = "10px system-ui, -apple-system";
      ctx.fillText(label, x, padT - 6);
    };
    drawVLine(snapshot.spot, "#ffffff", `SPOT ${snapshot.spot.toFixed(2)}`);
    drawVLine(snapshot.zeroGamma, "#f5a623", "ZERO γ");
    drawVLine(snapshot.callWall, "#22c55e", "CALL W");
    drawVLine(snapshot.putWall, "#ff3d71", "PUT W");
  }, [snapshot, zoom]);

  if (!snapshot) {
    return (
      <div className="gex-chart-wrap">
        <div className="gex-chart-title"><span>Net GEX by Strike</span></div>
        <div className="gex-chart-empty">Loading snapshot…</div>
      </div>
    );
  }

  return (
    <div className="gex-chart-wrap">
      <div className="gex-chart-title">
        <span>Net GEX by Strike</span>
        <div className="gex-chart-zoom">
          <button
            type="button"
            className={`gex-chart-zoom-btn ${zoom === "5pct" ? "gex-chart-zoom-btn-active" : ""}`}
            onClick={() => setZoom("5pct")}
          >
            ±5%
          </button>
          <button
            type="button"
            className={`gex-chart-zoom-btn ${zoom === "full" ? "gex-chart-zoom-btn-active" : ""}`}
            onClick={() => setZoom("full")}
          >
            Full
          </button>
        </div>
      </div>
      {snapshot.strikes.length === 0 ? (
        <div className="gex-chart-empty">No strike data available.</div>
      ) : (
        <canvas ref={canvasRef} className="gex-chart-canvas" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/components/gex
git commit -m "feat(gex): bar chart canvas with walls + zero gamma overlay"
```

---

## Task 12: Frontend — GexIvSmile canvas

**Files:**
- Create: `desktop/src/components/gex/GexIvSmile.tsx`
- Modify: `desktop/src/components/gex/gex.css` (append)

- [ ] **Step 1: Append CSS**

Append to `desktop/src/components/gex/gex.css`:
```css
/* ─── IV smile ────────────────────────────────────────────── */
.gex-smile-wrap {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gex-smile-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.gex-smile-title::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--brand-green);
  border-radius: 50%;
  margin-right: 10px;
  vertical-align: middle;
  box-shadow: 0 0 6px var(--brand-green);
}
.gex-smile-picker {
  background: var(--bg-axis);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
}
.gex-smile-canvas {
  width: 100%;
  height: 280px;
  display: block;
}
.gex-smile-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 60px 20px;
  font-style: italic;
}
.gex-smile-atm {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.gex-smile-atm-value {
  color: var(--brand-green);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
}
```

- [ ] **Step 2: `GexIvSmile`**

`desktop/src/components/gex/GexIvSmile.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";

export function GexIvSmile() {
  const snapshot = useGexStore((s) => s.snapshot);
  const selected = useGexStore((s) => s.selectedExpiration);
  const setSelected = useGexStore((s) => s.setSelectedExpiration);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const smile = snapshot?.ivSmiles.find((s) => s.expiration === selected) ??
                snapshot?.ivSmiles[0] ?? null;

  // ATM IV : strike with smallest |strike - spot|.
  let atmIv: number | null = null;
  if (smile && snapshot && smile.points.length > 0) {
    let best = smile.points[0];
    let bestDist = Math.abs(best.strike - snapshot.spot);
    for (const p of smile.points) {
      const d = Math.abs(p.strike - snapshot.spot);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    atmIv = best.iv;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !smile || !snapshot || smile.points.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Filter ±5% spot for readability.
    const spot = snapshot.spot;
    const pts = smile.points.filter((p) => Math.abs(p.strike - spot) / spot <= 0.05);
    if (pts.length < 2) return;

    const padL = 50, padR = 20, padT = 16, padB = 36;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const xs = pts.map((p) => p.strike);
    const ivs = pts.map((p) => p.iv);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ivs), yMax = Math.max(...ivs);
    const xRange = Math.max(0.01, xMax - xMin);
    const yRange = Math.max(0.001, yMax - yMin);

    const xOf = (s: number) => padL + ((s - xMin) / xRange) * w;
    const yOf = (iv: number) => padT + (1 - (iv - yMin) / yRange) * h;

    // Y axis labels (IV %).
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const iv = yMin + (yRange * i) / 4;
      const y = yOf(iv);
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padL - 6, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
    }

    // Spot vertical line.
    if (spot >= xMin && spot <= xMax) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xOf(spot), padT);
      ctx.lineTo(xOf(spot), padT + h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Sort by strike for line draw.
    const sorted = [...pts].sort((a, b) => a.strike - b.strike);
    // Two passes: puts (red, < spot) then calls (green, >= spot).
    const drawSegment = (color: string, filterFn: (s: number) => boolean) => {
      const seg = sorted.filter((p) => filterFn(p.strike));
      if (seg.length < 1) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      seg.forEach((p, i) => {
        const x = xOf(p.strike), y = yOf(p.iv);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Dots
      for (const p of seg) {
        ctx.beginPath();
        ctx.arc(xOf(p.strike), yOf(p.iv), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawSegment("#ff3d71", (s) => s < spot);
    drawSegment("#22c55e", (s) => s >= spot);

    // X axis ticks.
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "center";
    const tickEvery = Math.max(1, Math.floor(sorted.length / 6));
    for (let i = 0; i < sorted.length; i += tickEvery) {
      const x = xOf(sorted[i].strike);
      ctx.fillText(sorted[i].strike.toFixed(0), x, padT + h + 16);
    }
  }, [smile, snapshot]);

  if (!snapshot || !smile) {
    return (
      <div className="gex-smile-wrap">
        <div className="gex-smile-title"><span>IV Smile</span></div>
        <div className="gex-smile-empty">No IV data yet.</div>
      </div>
    );
  }

  return (
    <div className="gex-smile-wrap">
      <div className="gex-smile-title">
        <span>
          IV Smile
          {atmIv !== null && (
            <span className="gex-smile-atm">
              · ATM IV
              <span className="gex-smile-atm-value">{(atmIv * 100).toFixed(2)}%</span>
            </span>
          )}
        </span>
        <select
          className="gex-smile-picker"
          value={smile.expiration}
          onChange={(e) => setSelected(e.target.value)}
        >
          {snapshot.ivSmiles.map((s) => (
            <option key={s.expiration} value={s.expiration}>
              {s.expiration} · {s.daysToExpiry}D
            </option>
          ))}
        </select>
      </div>
      {smile.points.length < 2 ? (
        <div className="gex-smile-empty">Not enough strikes with IV data for this expiration.</div>
      ) : (
        <canvas ref={canvasRef} className="gex-smile-canvas" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/components/gex
git commit -m "feat(gex): IV smile canvas with expiration picker"
```

---

## Task 13: Frontend — GexRoute layout + BrokerSettings API key UI

**Files:**
- Modify: `desktop/src/routes/GexRoute.tsx` (full rewrite)
- Modify: `desktop/src/components/gex/gex.css` (append)
- Modify: `desktop/src/components/BrokerSettings.tsx`

- [ ] **Step 1: Append CSS for empty/error states**

Append to `desktop/src/components/gex/gex.css`:
```css
/* ─── Empty / error states ────────────────────────────────── */
.gex-empty-state {
  padding: 80px 20px;
  text-align: center;
  color: var(--text-muted);
}
.gex-empty-state-icon {
  display: block;
  font-size: 44px;
  color: var(--brand-green-dim);
  margin-bottom: 14px;
}
.gex-empty-state-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.gex-empty-state-sub {
  font-size: 12px;
  opacity: 0.8;
}
.gex-error-banner {
  background: var(--bg-surface);
  border: 1px solid var(--accent-red);
  color: var(--accent-red);
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 12px;
}
```

- [ ] **Step 2: Rewrite `GexRoute`**

`desktop/src/routes/GexRoute.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useGexStore } from "../lib/gex/useGexStore";
import { useGexPolling } from "../lib/gex/useGexPolling";
import { hasApiKey } from "../lib/gex/api";
import { GexHeader } from "../components/gex/GexHeader";
import { GexKeyLevels } from "../components/gex/GexKeyLevels";
import { GexBarChart } from "../components/gex/GexBarChart";
import { GexIvSmile } from "../components/gex/GexIvSmile";
import "../components/gex/gex.css";

export function GexRoute() {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then(setKeyConfigured)
      .catch(() => setKeyConfigured(false));
  }, []);

  if (keyConfigured === false) {
    return (
      <div className="gex-route">
        <div className="gex-empty-state">
          <span className="gex-empty-state-icon">◌</span>
          <div className="gex-empty-state-title">Tradier API key required</div>
          <div className="gex-empty-state-sub">
            Configure your free Tradier sandbox key in Broker Settings to load
            the GEX dashboard.
          </div>
        </div>
      </div>
    );
  }

  if (keyConfigured === null) {
    return (
      <div className="gex-route">
        <div className="gex-empty-state">
          <span className="gex-empty-state-icon">◌</span>
          <div className="gex-empty-state-title">Loading…</div>
        </div>
      </div>
    );
  }

  return <GexConfigured />;
}

function GexConfigured() {
  useGexPolling();
  const error = useGexStore((s) => s.error);

  return (
    <div className="gex-route">
      <GexHeader />
      {error && <div className="gex-error-banner">{error}</div>}
      <GexKeyLevels />
      <GexBarChart />
      <GexIvSmile />
    </div>
  );
}
```

- [ ] **Step 3: Add Tradier API key section in `BrokerSettings`**

Open `desktop/src/components/BrokerSettings.tsx`. Add imports near the top (next to the Finnhub ones):
```ts
import {
  hasApiKey as hasTradierKey,
  saveApiKey as saveTradierKey,
  deleteApiKey as deleteTradierKey,
} from "../lib/gex/api";
```

Inside the component, add state hooks alongside the Finnhub ones:
```ts
const [tradierKey, setTradierKey] = useState("");
const [tradierKeySet, setTradierKeySet] = useState<boolean | null>(null);
const [tradierStatus, setTradierStatus] = useState<
  { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "success"; msg: string }
>({ kind: "idle" });
```

Add bootstrap useEffect (next to the Finnhub one):
```ts
useEffect(() => {
  void hasTradierKey()
    .then(setTradierKeySet)
    .catch(() => setTradierKeySet(false));
}, []);
```

Add handlers:
```ts
const handleSaveTradier = useCallback(async () => {
  const trimmed = tradierKey.trim();
  if (!trimmed) {
    setTradierStatus({ kind: "error", msg: "Empty key." });
    return;
  }
  setTradierStatus({ kind: "busy" });
  try {
    await saveTradierKey(trimmed);
    setTradierStatus({ kind: "success", msg: "Saved." });
    setTradierKeySet(true);
    setTradierKey("");
  } catch (e) {
    setTradierStatus({ kind: "error", msg: String(e) });
  }
}, [tradierKey]);

const handleDeleteTradier = useCallback(async () => {
  setTradierStatus({ kind: "busy" });
  try {
    await deleteTradierKey();
    setTradierStatus({ kind: "success", msg: "Deleted." });
    setTradierKeySet(false);
  } catch (e) {
    setTradierStatus({ kind: "error", msg: String(e) });
  }
}, []);
```

Insert the JSX section **after** the existing Finnhub section, before the closing `</div>` of the main settings panel:
```tsx
<section className="bs-section" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #2a2f3a" }}>
  <h3 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#c8ccd4" }}>
    Tradier API key (GEX module)
  </h3>
  <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#8a8f99" }}>
    Required for the GEX dashboard (SPY / QQQ gamma exposure + IV smile). Sign
    up free at developer.tradier.com (sandbox tier, 60 req/min). Key is stored
    in your OS keyring.
  </p>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <input
      type="password"
      placeholder={tradierKeySet ? "•••••• (configured)" : "Paste your Tradier sandbox API key"}
      value={tradierKey}
      onChange={(e) => setTradierKey(e.target.value)}
      style={{ flex: 1, padding: "6px 10px", background: "#0f1115", color: "#e6e9ef", border: "1px solid #2a2f3a", borderRadius: 6 }}
    />
    <button
      type="button"
      onClick={() => void handleSaveTradier()}
      disabled={tradierStatus.kind === "busy"}
    >
      Save key
    </button>
    {tradierKeySet && (
      <button
        type="button"
        onClick={() => void handleDeleteTradier()}
        disabled={tradierStatus.kind === "busy"}
      >
        Remove
      </button>
    )}
  </div>
  {tradierStatus.kind === "error" && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#ff6b78" }}>{tradierStatus.msg}</div>
  )}
  {tradierStatus.kind === "success" && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#51e09a" }}>{tradierStatus.msg}</div>
  )}
</section>
```

- [ ] **Step 4: Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 5: Manual smoke test**

```bash
cd desktop && npm run tauri dev
```

Procedure :
1. Open Broker Settings → bottom of the modal → paste a Tradier sandbox API key (free at developer.tradier.com) → Save key → "Saved.".
2. Navigate to `/gex`. Header should show SPY/QQQ pills + Spot + "Loading…" → after a few seconds the snapshot loads.
3. Verify the 3 KPI cards (Zero γ / Call Wall / Put Wall) show non-null values during market hours.
4. Verify the bar chart shows green call bars above 0, red put bars below 0, vertical lines for spot + walls.
5. Toggle the ±5% / Full zoom button.
6. Verify the IV smile section shows a chart with red put segment + green call segment, ATM IV label in the title.
7. Switch the expiration picker — chart redraws.
8. Switch to QQQ — fresh fetch, new snapshot displays.
9. Toggle Auto 15min off → no further fetches. Toggle on → resumes.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/routes/GexRoute.tsx desktop/src/components/gex desktop/src/components/BrokerSettings.tsx
git commit -m "feat(gex): wire GexRoute layout + tradier api key UI in BrokerSettings"
```

---

## Self-Review

**Spec coverage:**
- Source Tradier Sandbox → Task 2 (client) + Task 3 (parsers) ✓
- SPY + QQQ symbols → Task 7 (`GexSymbol`), Task 10 (`GexHeader` pills) ✓
- Net GEX per strike → Task 5 (compute_gex) ✓
- Zero Gamma / Call Wall / Put Wall → Task 5 (compute) + Task 10 (KPI cards) ✓
- Bar chart strike-by-strike → Task 11 ✓
- IV Smile per expiration → Task 5 (compute) + Task 12 (chart) ✓
- Refresh manuel + auto 15min + visibility-pause → Task 9 (polling hook) + Task 10 (toggle UI) ✓
- API key keyring + UI → Task 4 (vault) + Task 6 (commands) + Task 13 (BrokerSettings section) ✓
- Cache 15 min → Task 6 (GexState TTL) ✓
- Expirations window 30 days → Task 6 (filter) ✓
- Spot fetched separately via /markets/quotes → Task 3 + Task 6 ✓
- Convention dealer puts négatif → Task 5 (sign in compute) + Task 11 (red below) ✓
- Empty state if no API key → Task 13 (GexRoute branch) ✓
- Error banner → Task 13 ✓
- Responsive logo-green scoped → Task 10 (`.gex-route` CSS vars) ✓

**Placeholder scan:**
- "NOTE on greeks field names" in Task 3 — explicit fallback chain (smv_vol → mid_iv → bid/ask avg), `pick_iv` helper implements it. Not a placeholder.
- "If you see 'cannot find type TtlCache', adjust the import" in Task 6 — explicit conditional fix, not a placeholder.

**Type consistency:**
- `GexSnapshot` Rust ↔ TS : `symbol, spot, computedAt, expirationCount, strikes, zeroGamma, callWall, putWall, totalGex, stale, ivSmiles`. Matches.
- `GexStrike` : `strike, callGex, putGex, netGex`. Matches.
- `IvSmile` : `expiration, daysToExpiry, points`. Matches.
- `IvPoint` : `strike, iv, side`. Matches.
- `IvSide` : Rust `lowercase` enum (Put/Call → "put"/"call") ↔ TS `"put" | "call"`. Matches.
- Commands : `gex_fetch_snapshot`, `gex_save_api_key`, `gex_has_api_key`, `gex_delete_api_key` consistent between Task 6 (Rust) and Task 7 (TS wrappers).
- `FetchGexArgs { symbol }` Rust ↔ JS `{ args: { symbol } }`. Matches.
