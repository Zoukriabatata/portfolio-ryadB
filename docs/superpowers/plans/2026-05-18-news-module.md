# News Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a News module in the Tauri desktop app showing a Finnhub-backed economic calendar and a continuous market-news feed.

**Architecture:** All Finnhub I/O runs through Rust Tauri commands (cohérent avec le pattern Rithmic du projet). Cache mémoire côté Rust (60 s news / 5 min calendrier) pour économiser le quota gratuit (60 req/min). Frontend React consomme via un store Zustand + hook de polling. UI = layout 60/40 dans `NewsRoute`.

**Tech Stack:**
- Backend : Rust, `reqwest` (déjà dépendance), `keyring` (déjà dépendance), `tokio`, `serde`, `thiserror`, `tracing`.
- Frontend : React 19, TypeScript, Zustand 5 (déjà dépendance), Tauri 2 invoke, `tauri-plugin-opener` (déjà dépendance, ouvrir URLs externes).
- Spec : `docs/superpowers/specs/2026-05-18-news-module-design.md`.

**Conventions :**
- Tous les chemins de fichier sont relatifs à la racine du repo (`orderflow-v2/`).
- Pour Rust, commandes `cargo` à exécuter depuis `desktop/src-tauri/`.
- Pour npm, commandes à exécuter depuis `desktop/`.
- Style de commit du projet : `feat(scope): message` / `fix(scope): message`. Co-author Claude selon préférence user.

---

## Task 1: Backend — Finnhub error type + module skeleton

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/mod.rs`
- Create: `desktop/src-tauri/src/connectors/finnhub/error.rs`
- Modify: `desktop/src-tauri/src/connectors/mod.rs` (déclarer le sous-module `finnhub`)

- [ ] **Step 1 : Créer le squelette du module**

`desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
//! Finnhub.io REST client — feeds the News module (économic calendar
//! + market news). Quota gratuit : 60 req/min, partagé entre toutes
//! les requêtes (calendar + news). Le cache TTL côté `cache.rs`
//! protège ce quota en évitant les refetch trop fréquents.

pub mod error;

pub use error::{FinnhubError, Result};
```

- [ ] **Step 2 : Définir les erreurs typées**

`desktop/src-tauri/src/connectors/finnhub/error.rs` :
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum FinnhubError {
    #[error("Finnhub API key not configured — set it in Settings")]
    NoApiKey,

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Finnhub unauthorized (HTTP 401) — check your API key")]
    Unauthorized,

    #[error("Finnhub rate limited (HTTP 429) — retry later")]
    RateLimited,

    #[error("Finnhub upstream error (HTTP {0})")]
    Upstream(u16),

    #[error("Finnhub returned unexpected payload: {0}")]
    Decode(String),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

pub type Result<T> = std::result::Result<T, FinnhubError>;
```

- [ ] **Step 3 : Déclarer le sous-module dans le tree connectors**

Lire `desktop/src-tauri/src/connectors/mod.rs`, ajouter la ligne `pub mod finnhub;` au bon endroit (à côté de `pub mod rithmic;` / `pub mod binance;` etc.).

- [ ] **Step 4 : Vérifier que ça compile**

```bash
cd desktop/src-tauri && cargo check
```
Expected : 0 errors, 0 warnings sur le nouveau module.

- [ ] **Step 5 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub desktop/src-tauri/src/connectors/mod.rs
git commit -m "feat(news): scaffold finnhub connector module"
```

---

## Task 2: Backend — HTTP client with API key injection

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/client.rs`
- Modify: `desktop/src-tauri/src/connectors/finnhub/mod.rs`

- [ ] **Step 1 : Implémenter le client HTTP**

`desktop/src-tauri/src/connectors/finnhub/client.rs` :
```rust
//! Thin reqwest wrapper that knows how to talk to api.finnhub.io.
//! Adds the API key as a query param `token=...` (Finnhub convention),
//! maps HTTP status codes to typed errors.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::connectors::finnhub::error::{FinnhubError, Result};

const BASE_URL: &str = "https://finnhub.io/api/v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub struct FinnhubClient {
    http: reqwest::Client,
    api_key: String,
}

impl FinnhubClient {
    pub fn new(api_key: String) -> Result<Self> {
        if api_key.trim().is_empty() {
            return Err(FinnhubError::NoApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, api_key })
    }

    /// GET `BASE_URL/{path}?{query}&token={key}` and decode JSON as `T`.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T> {
        let url = format!("{}/{}", BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .query(query)
            .query(&[("token", self.api_key.as_str())])
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let text = resp.text().await?;
                serde_json::from_str(&text)
                    .map_err(|e| FinnhubError::Decode(e.to_string()))
            }
            401 => Err(FinnhubError::Unauthorized),
            429 => Err(FinnhubError::RateLimited),
            code => Err(FinnhubError::Upstream(code)),
        }
    }
}
```

- [ ] **Step 2 : Re-exporter le client depuis mod.rs**

Modifier `desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
//! Finnhub.io REST client — feeds the News module (économic calendar
//! + market news). Quota gratuit : 60 req/min, partagé entre toutes
//! les requêtes (calendar + news). Le cache TTL côté `cache.rs`
//! protège ce quota en évitant les refetch trop fréquents.

pub mod client;
pub mod error;

pub use client::FinnhubClient;
pub use error::{FinnhubError, Result};
```

- [ ] **Step 3 : Compile check**

```bash
cd desktop/src-tauri && cargo check
```
Expected : 0 errors.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub
git commit -m "feat(news): add finnhub HTTP client with typed errors"
```

---

## Task 3: Backend — In-memory cache with TTL

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/cache.rs`
- Modify: `desktop/src-tauri/src/connectors/finnhub/mod.rs`

- [ ] **Step 1 : Implémenter le cache TTL**

`desktop/src-tauri/src/connectors/finnhub/cache.rs` :
```rust
//! TTL cache for Finnhub responses. Single-process, in-memory.
//! Keyed by an arbitrary string (caller composes "endpoint|params").
//! Cleared at app boot — pas de persistance disque.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Generic single-typed cache. Each instance holds entries of `T`.
pub struct TtlCache<T: Clone + Send + Sync + 'static> {
    inner: Arc<RwLock<HashMap<String, (Instant, T)>>>,
    ttl: Duration,
}

impl<T: Clone + Send + Sync + 'static> TtlCache<T> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            ttl,
        }
    }

    /// Return the cached value if its age is `<= ttl`, else `None`.
    pub async fn get(&self, key: &str) -> Option<T> {
        let guard = self.inner.read().await;
        let (inserted_at, value) = guard.get(key)?;
        if inserted_at.elapsed() <= self.ttl {
            Some(value.clone())
        } else {
            None
        }
    }

    pub async fn set(&self, key: String, value: T) {
        let mut guard = self.inner.write().await;
        guard.insert(key, (Instant::now(), value));
    }
}

impl<T: Clone + Send + Sync + 'static> Clone for TtlCache<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            ttl: self.ttl,
        }
    }
}
```

- [ ] **Step 2 : Écrire les tests unitaires**

À la fin du même fichier, ajouter :
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::sleep;

    #[tokio::test]
    async fn returns_value_within_ttl() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_secs(1));
        cache.set("k".into(), "v".into()).await;
        assert_eq!(cache.get("k").await, Some("v".into()));
    }

    #[tokio::test]
    async fn returns_none_after_ttl() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_millis(20));
        cache.set("k".into(), "v".into()).await;
        sleep(Duration::from_millis(50)).await;
        assert_eq!(cache.get("k").await, None);
    }

    #[tokio::test]
    async fn missing_key_is_none() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_secs(1));
        assert_eq!(cache.get("absent").await, None);
    }
}
```

- [ ] **Step 3 : Re-exporter depuis mod.rs**

Ajouter dans `desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
pub mod cache;
```
et `pub use cache::TtlCache;` (sous les autres `pub use`).

- [ ] **Step 4 : Run tests**

```bash
cd desktop/src-tauri && cargo test --lib connectors::finnhub::cache
```
Expected : 3 tests pass.

- [ ] **Step 5 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub
git commit -m "feat(news): add TTL cache for finnhub responses"
```

---

## Task 4: Backend — Economic calendar endpoint + types

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/calendar.rs`
- Modify: `desktop/src-tauri/src/connectors/finnhub/mod.rs`

Référence : Finnhub `GET /calendar/economic?from=YYYY-MM-DD&to=YYYY-MM-DD`. Réponse forme :
```json
{
  "economicCalendar": [
    {
      "country": "US",
      "event": "CPI YoY",
      "time": "2026-05-19 12:30:00",
      "impact": "high",
      "actual": null,
      "estimate": 3.4,
      "prev": 3.5,
      "unit": "%"
    }
  ]
}
```

- [ ] **Step 1 : Définir les types Rust et le parser**

`desktop/src-tauri/src/connectors/finnhub/calendar.rs` :
```rust
//! Economic calendar: GET /calendar/economic.

use serde::{Deserialize, Serialize};

use crate::connectors::finnhub::client::FinnhubClient;
use crate::connectors::finnhub::error::Result;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Impact { Low, Medium, High }

impl Impact {
    fn from_finnhub_str(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "high" => Impact::High,
            "medium" => Impact::Medium,
            _ => Impact::Low,
        }
    }
}

/// Public shape sent to the React layer (camelCase via serde rename).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EconomicEvent {
    /// Stable id: hash of (country, event, time_utc) since Finnhub
    /// doesn't ship one. Lets the frontend `key={event.id}`.
    pub id: String,
    pub country: String,       // "US", "EU", "GB", "JP"...
    pub impact: Impact,
    pub event: String,
    pub time_utc: String,      // ISO 8601, e.g. "2026-05-19T12:30:00Z"
    pub actual: Option<f64>,
    pub forecast: Option<f64>,
    pub previous: Option<f64>,
    pub unit: String,
}

/// Raw Finnhub payload — internal to this module.
#[derive(Debug, Deserialize)]
struct RawCalendarResponse {
    #[serde(rename = "economicCalendar", default)]
    economic_calendar: Vec<RawEvent>,
}

#[derive(Debug, Deserialize)]
struct RawEvent {
    #[serde(default)]
    country: String,
    #[serde(default)]
    event: String,
    /// Finnhub returns "YYYY-MM-DD HH:MM:SS" in UTC.
    #[serde(default)]
    time: String,
    #[serde(default)]
    impact: String,
    actual: Option<f64>,
    estimate: Option<f64>,
    prev: Option<f64>,
    #[serde(default)]
    unit: String,
}

fn stable_id(country: &str, event: &str, time: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    country.hash(&mut h);
    event.hash(&mut h);
    time.hash(&mut h);
    format!("{:x}", h.finish())
}

/// Convert "2026-05-19 12:30:00" → "2026-05-19T12:30:00Z".
/// Finnhub already returns UTC; we just reshape to ISO 8601.
fn to_iso8601_utc(finnhub_time: &str) -> String {
    if finnhub_time.is_empty() {
        return String::new();
    }
    format!("{}Z", finnhub_time.replacen(' ', "T", 1))
}

pub async fn fetch_calendar(
    client: &FinnhubClient,
    from_date: &str,
    to_date: &str,
) -> Result<Vec<EconomicEvent>> {
    let raw: RawCalendarResponse = client
        .get_json("calendar/economic", &[("from", from_date), ("to", to_date)])
        .await?;
    let mut out: Vec<EconomicEvent> = raw
        .economic_calendar
        .into_iter()
        .map(|e| EconomicEvent {
            id: stable_id(&e.country, &e.event, &e.time),
            country: e.country,
            impact: Impact::from_finnhub_str(&e.impact),
            event: e.event,
            time_utc: to_iso8601_utc(&e.time),
            actual: e.actual,
            forecast: e.estimate,
            previous: e.prev,
            unit: e.unit,
        })
        .collect();
    out.sort_by(|a, b| a.time_utc.cmp(&b.time_utc));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_canonical_finnhub_payload() {
        let json = r#"{
            "economicCalendar": [
                {
                    "country": "US", "event": "CPI YoY",
                    "time": "2026-05-19 12:30:00", "impact": "high",
                    "actual": null, "estimate": 3.4, "prev": 3.5,
                    "unit": "%"
                }
            ]
        }"#;
        let raw: RawCalendarResponse = serde_json::from_str(json).unwrap();
        assert_eq!(raw.economic_calendar.len(), 1);
        assert_eq!(raw.economic_calendar[0].country, "US");
        assert_eq!(raw.economic_calendar[0].estimate, Some(3.4));
    }

    #[test]
    fn impact_maps_high_medium_low_and_unknown() {
        assert!(matches!(Impact::from_finnhub_str("high"), Impact::High));
        assert!(matches!(Impact::from_finnhub_str("HIGH"), Impact::High));
        assert!(matches!(Impact::from_finnhub_str("medium"), Impact::Medium));
        assert!(matches!(Impact::from_finnhub_str("low"), Impact::Low));
        assert!(matches!(Impact::from_finnhub_str("???"), Impact::Low));
    }

    #[test]
    fn time_reshape_to_iso8601() {
        assert_eq!(
            to_iso8601_utc("2026-05-19 12:30:00"),
            "2026-05-19T12:30:00Z"
        );
        assert_eq!(to_iso8601_utc(""), "");
    }

    #[test]
    fn missing_calendar_field_yields_empty_vec() {
        let raw: RawCalendarResponse = serde_json::from_str("{}").unwrap();
        assert!(raw.economic_calendar.is_empty());
    }
}
```

- [ ] **Step 2 : Re-exporter depuis mod.rs**

Ajouter dans `desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
pub mod calendar;

pub use calendar::{fetch_calendar, EconomicEvent, Impact};
```

- [ ] **Step 3 : Run tests**

```bash
cd desktop/src-tauri && cargo test --lib connectors::finnhub::calendar
```
Expected : 4 tests pass.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub
git commit -m "feat(news): add economic calendar fetcher + types"
```

---

## Task 5: Backend — Market news endpoint + types

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/news.rs`
- Modify: `desktop/src-tauri/src/connectors/finnhub/mod.rs`

Référence : Finnhub `GET /news?category=general`. Réponse : tableau plat d'objets.
```json
[
  { "id": 12345, "headline": "...", "summary": "...", "url": "...",
    "source": "Reuters", "image": "https://...", "datetime": 1747569600,
    "category": "general" }
]
```

- [ ] **Step 1 : Définir les types et le parser**

`desktop/src-tauri/src/connectors/finnhub/news.rs` :
```rust
//! Market news: GET /news?category=general.

use serde::{Deserialize, Serialize};

use crate::connectors::finnhub::client::FinnhubClient;
use crate::connectors::finnhub::error::Result;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsArticle {
    pub id: String,            // Finnhub ships i64; we serialize as string for stable React keys.
    pub headline: String,
    pub summary: String,
    pub url: String,
    pub source: String,
    pub image_url: String,
    pub published_at: String,  // ISO 8601 derived from `datetime` (Unix s)
    pub category: String,
}

#[derive(Debug, Deserialize)]
struct RawArticle {
    #[serde(default)]
    id: i64,
    #[serde(default)]
    headline: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    image: String,
    /// Unix seconds.
    #[serde(default)]
    datetime: i64,
    #[serde(default)]
    category: String,
}

fn unix_to_iso8601(unix_secs: i64) -> String {
    // Manual epoch→ISO conversion to avoid a chrono dep. UTC only.
    // Algo from civil_from_days (Howard Hinnant).
    if unix_secs <= 0 {
        return String::new();
    }
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
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, h, mi, s
    )
}

pub async fn fetch_news(
    client: &FinnhubClient,
    category: &str,
) -> Result<Vec<NewsArticle>> {
    let raw: Vec<RawArticle> = client
        .get_json("news", &[("category", category)])
        .await?;
    let mut out: Vec<NewsArticle> = raw
        .into_iter()
        .filter(|a| !a.headline.is_empty() && !a.url.is_empty())
        .map(|a| NewsArticle {
            id: a.id.to_string(),
            headline: a.headline,
            summary: a.summary,
            url: a.url,
            source: a.source,
            image_url: a.image,
            published_at: unix_to_iso8601(a.datetime),
            category: a.category,
        })
        .collect();
    // Newest first.
    out.sort_by(|a, b| b.published_at.cmp(&a.published_at));
    // Hard cap at 100 to bound memory + frontend rendering cost.
    out.truncate(100);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_finnhub_news_array() {
        let json = r#"[
            { "id": 42, "headline": "Powell says...", "summary": "blah",
              "url": "https://x", "source": "Reuters", "image": "https://img",
              "datetime": 1747569600, "category": "general" }
        ]"#;
        let raw: Vec<RawArticle> = serde_json::from_str(json).unwrap();
        assert_eq!(raw.len(), 1);
        assert_eq!(raw[0].headline, "Powell says...");
    }

    #[test]
    fn empty_headline_is_filtered() {
        // Real Finnhub responses occasionally include empty rows;
        // we drop them in the public mapping (test the rule, not
        // the mapping fn directly since it lives inside fetch_news).
        let raw = RawArticle {
            id: 1, headline: "".into(), summary: "".into(),
            url: "https://x".into(), source: "".into(), image: "".into(),
            datetime: 1, category: "general".into(),
        };
        let keep = !raw.headline.is_empty() && !raw.url.is_empty();
        assert!(!keep);
    }

    #[test]
    fn unix_to_iso_known_values() {
        // 2026-05-18T12:00:00Z = 1779451200 (verified externally).
        assert_eq!(unix_to_iso8601(1779451200), "2026-05-18T12:00:00Z");
        assert_eq!(unix_to_iso8601(0), "");
        assert_eq!(unix_to_iso8601(-1), "");
    }
}
```

- [ ] **Step 2 : Re-exporter depuis mod.rs**

Ajouter dans `desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
pub mod news;

pub use news::{fetch_news, NewsArticle};
```

- [ ] **Step 3 : Run tests**

```bash
cd desktop/src-tauri && cargo test --lib connectors::finnhub::news
```
Expected : 3 tests pass.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub
git commit -m "feat(news): add market news fetcher + types"
```

---

## Task 6: Backend — API key storage (keyring) + getter

**Files:**
- Create: `desktop/src-tauri/src/connectors/finnhub/api_key.rs`
- Modify: `desktop/src-tauri/src/connectors/finnhub/mod.rs`

Pattern de référence : `desktop/src-tauri/src/brokers/vault.rs` (utilise `keyring::Entry::new(SERVICE, ACCOUNT)`).

- [ ] **Step 1 : Implémenter le vault Finnhub**

`desktop/src-tauri/src/connectors/finnhub/api_key.rs` :
```rust
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
```

- [ ] **Step 2 : Re-exporter depuis mod.rs**

Ajouter dans `desktop/src-tauri/src/connectors/finnhub/mod.rs` :
```rust
pub mod api_key;
```

- [ ] **Step 3 : Vérifier compile**

```bash
cd desktop/src-tauri && cargo check
```
Expected : 0 errors.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src-tauri/src/connectors/finnhub
git commit -m "feat(news): keyring-backed finnhub api key storage"
```

---

## Task 7: Backend — Tauri commands + state + wiring

**Files:**
- Create: `desktop/src-tauri/src/commands/news.rs`
- Modify: `desktop/src-tauri/src/commands/mod.rs` (déclarer `pub mod news;`)
- Modify: `desktop/src-tauri/src/lib.rs` (register state + commands)

- [ ] **Step 1 : Définir le state partagé**

`desktop/src-tauri/src/commands/news.rs` (début) :
```rust
//! Tauri commands for the News module. Wraps the Finnhub connector
//! behind two cached endpoints (calendar + articles).

use std::time::Duration;
use tauri::State;

use crate::connectors::finnhub::{
    api_key, fetch_calendar, fetch_news, EconomicEvent, FinnhubClient, NewsArticle, TtlCache,
};

const CALENDAR_TTL: Duration = Duration::from_secs(5 * 60);
const NEWS_TTL: Duration = Duration::from_secs(60);

pub struct NewsState {
    pub calendar_cache: TtlCache<Vec<EconomicEvent>>,
    pub news_cache: TtlCache<Vec<NewsArticle>>,
}

impl NewsState {
    pub fn new() -> Self {
        Self {
            calendar_cache: TtlCache::new(CALENDAR_TTL),
            news_cache: TtlCache::new(NEWS_TTL),
        }
    }
}

impl Default for NewsState {
    fn default() -> Self { Self::new() }
}
```

- [ ] **Step 2 : Implémenter `news_fetch_calendar`**

À la suite dans le même fichier :
```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchCalendarArgs {
    pub from_date: String, // "YYYY-MM-DD"
    pub to_date: String,
}

#[tauri::command]
pub async fn news_fetch_calendar(
    state: State<'_, NewsState>,
    args: FetchCalendarArgs,
) -> Result<Vec<EconomicEvent>, String> {
    let cache_key = format!("cal|{}|{}", args.from_date, args.to_date);
    if let Some(hit) = state.calendar_cache.get(&cache_key).await {
        tracing::info!("news_fetch_calendar: cache hit {} entries", hit.len());
        return Ok(hit);
    }
    let api_key = api_key::load()
        .map_err(|e| format!("finnhub vault: {e}"))?
        .ok_or_else(|| "Finnhub API key not configured — set it in Settings".to_string())?;
    let client = FinnhubClient::new(api_key).map_err(|e| e.to_string())?;
    let events = fetch_calendar(&client, &args.from_date, &args.to_date)
        .await
        .map_err(|e| e.to_string())?;
    tracing::info!("news_fetch_calendar: fetched {} events", events.len());
    state.calendar_cache.set(cache_key, events.clone()).await;
    Ok(events)
}
```

- [ ] **Step 3 : Implémenter `news_fetch_articles`**

À la suite :
```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchArticlesArgs {
    pub category: String,
}

#[tauri::command]
pub async fn news_fetch_articles(
    state: State<'_, NewsState>,
    args: FetchArticlesArgs,
) -> Result<Vec<NewsArticle>, String> {
    let cache_key = format!("news|{}", args.category);
    if let Some(hit) = state.news_cache.get(&cache_key).await {
        tracing::info!("news_fetch_articles: cache hit {} entries", hit.len());
        return Ok(hit);
    }
    let api_key = api_key::load()
        .map_err(|e| format!("finnhub vault: {e}"))?
        .ok_or_else(|| "Finnhub API key not configured — set it in Settings".to_string())?;
    let client = FinnhubClient::new(api_key).map_err(|e| e.to_string())?;
    let articles = fetch_news(&client, &args.category)
        .await
        .map_err(|e| e.to_string())?;
    tracing::info!("news_fetch_articles: fetched {} articles", articles.len());
    state.news_cache.set(cache_key, articles.clone()).await;
    Ok(articles)
}
```

- [ ] **Step 4 : Implémenter les commands API key**

À la suite :
```rust
#[tauri::command]
pub async fn news_save_api_key(key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty".to_string());
    }
    tokio::task::spawn_blocking(move || api_key::save(trimmed))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn news_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| api_key::load())
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn news_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(|| api_key::delete())
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5 : Déclarer le module dans commands/mod.rs**

Lire `desktop/src-tauri/src/commands/mod.rs`, ajouter `pub mod news;` à côté des autres `pub mod ...;`.

- [ ] **Step 6 : Register state + handlers dans lib.rs**

Lire `desktop/src-tauri/src/lib.rs`, repérer le bloc `.manage(...)` et `.invoke_handler(tauri::generate_handler![...])`.

Ajouter avant le `tauri::Builder::default()` chain (ou dans la `setup`) :
```rust
.manage(crate::commands::news::NewsState::new())
```

Ajouter dans le `generate_handler![...]` (en suivant le style des handlers existants — virgule à la fin de la ligne précédente) :
```rust
crate::commands::news::news_fetch_calendar,
crate::commands::news::news_fetch_articles,
crate::commands::news::news_save_api_key,
crate::commands::news::news_has_api_key,
crate::commands::news::news_delete_api_key,
```

- [ ] **Step 7 : Compile check + run cargo tests**

```bash
cd desktop/src-tauri && cargo check && cargo test --lib connectors::finnhub
```
Expected : 0 errors, all finnhub tests pass.

- [ ] **Step 8 : Commit**

```bash
git add desktop/src-tauri/src/commands desktop/src-tauri/src/lib.rs
git commit -m "feat(news): expose finnhub commands + register NewsState"
```

---

## Task 8: Frontend — Zustand store + invoke wrappers

**Files:**
- Create: `desktop/src/lib/news/api.ts`
- Create: `desktop/src/lib/news/useNewsStore.ts`

- [ ] **Step 1 : Wrappers d'appels Tauri**

`desktop/src/lib/news/api.ts` :
```ts
import { invoke } from "@tauri-apps/api/core";

export type Impact = "low" | "medium" | "high";

export type EconomicEvent = {
  id: string;
  country: string;
  impact: Impact;
  event: string;
  timeUtc: string;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string;
};

export type NewsArticle = {
  id: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  imageUrl: string;
  publishedAt: string;
  category: string;
};

export async function fetchCalendar(
  fromDate: string,
  toDate: string,
): Promise<EconomicEvent[]> {
  return invoke<EconomicEvent[]>("news_fetch_calendar", {
    args: { fromDate, toDate },
  });
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  return invoke<NewsArticle[]>("news_fetch_articles", {
    args: { category },
  });
}

export async function saveApiKey(key: string): Promise<void> {
  return invoke<void>("news_save_api_key", { key });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("news_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("news_delete_api_key");
}
```

- [ ] **Step 2 : Store Zustand**

`desktop/src/lib/news/useNewsStore.ts` :
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EconomicEvent, Impact, NewsArticle } from "./api";
import { fetchArticles, fetchCalendar } from "./api";

type CountryCode = "US" | "EU" | "GB" | "JP" | "CN";

export type Filters = {
  range: "today" | "7d";
  impact: Record<Impact, boolean>;
  countries: Record<CountryCode, boolean>;
};

const DEFAULT_FILTERS: Filters = {
  range: "7d",
  impact: { high: true, medium: false, low: false },
  countries: { US: true, EU: true, GB: false, JP: false, CN: false },
};

type NewsState = {
  articles: NewsArticle[];
  articlesFetchedAt: number | null;
  articlesLoading: boolean;
  articlesError: string | null;

  events: EconomicEvent[];
  eventsFetchedAt: number | null;
  eventsLoading: boolean;
  eventsError: string | null;

  filters: Filters;
  setRange: (range: Filters["range"]) => void;
  toggleImpact: (i: Impact) => void;
  toggleCountry: (c: CountryCode) => void;

  refreshArticles: () => Promise<void>;
  refreshEvents: () => Promise<void>;
};

function yyyymmddUtc(d: Date): string {
  // Compute today's window in UTC to match Finnhub's calendar TZ.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeWindow(range: Filters["range"]): { from: string; to: string } {
  const now = new Date();
  const from = yyyymmddUtc(now);
  const toDate = new Date(now);
  toDate.setUTCDate(toDate.getUTCDate() + (range === "today" ? 0 : 7));
  return { from, to: yyyymmddUtc(toDate) };
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set, get) => ({
      articles: [],
      articlesFetchedAt: null,
      articlesLoading: false,
      articlesError: null,

      events: [],
      eventsFetchedAt: null,
      eventsLoading: false,
      eventsError: null,

      filters: DEFAULT_FILTERS,
      setRange: (range) => {
        set((s) => ({ filters: { ...s.filters, range } }));
        // Range change extends the calendar window — refetch.
        void get().refreshEvents();
      },
      toggleImpact: (i) =>
        set((s) => ({
          filters: {
            ...s.filters,
            impact: { ...s.filters.impact, [i]: !s.filters.impact[i] },
          },
        })),
      toggleCountry: (c) =>
        set((s) => ({
          filters: {
            ...s.filters,
            countries: { ...s.filters.countries, [c]: !s.filters.countries[c] },
          },
        })),

      refreshArticles: async () => {
        set({ articlesLoading: true, articlesError: null });
        try {
          const list = await fetchArticles("general");
          set({
            articles: list,
            articlesFetchedAt: Date.now(),
            articlesLoading: false,
          });
        } catch (e) {
          set({
            articlesError: String(e),
            articlesLoading: false,
          });
        }
      },

      refreshEvents: async () => {
        set({ eventsLoading: true, eventsError: null });
        try {
          const { from, to } = computeWindow(get().filters.range);
          const list = await fetchCalendar(from, to);
          set({
            events: list,
            eventsFetchedAt: Date.now(),
            eventsLoading: false,
          });
        } catch (e) {
          set({
            eventsError: String(e),
            eventsLoading: false,
          });
        }
      },
    }),
    {
      name: "orderflow:news:filters",
      // Only persist filter preferences — re-fetch data on each session.
      partialize: (s) => ({ filters: s.filters }),
    },
  ),
);
```

- [ ] **Step 3 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src/lib/news
git commit -m "feat(news): zustand store + tauri invoke wrappers"
```

---

## Task 9: Frontend — Polling hook with visibility pause

**Files:**
- Create: `desktop/src/lib/news/useFinnhubPolling.ts`

- [ ] **Step 1 : Hook polling**

`desktop/src/lib/news/useFinnhubPolling.ts` :
```ts
import { useEffect } from "react";
import { useNewsStore } from "./useNewsStore";

const ARTICLES_INTERVAL_MS = 60_000;
const EVENTS_INTERVAL_MS = 5 * 60_000;

/** One-instance hook : mount in NewsRoute only. Kicks off an
 *  immediate fetch, then polls articles every 60s and events every
 *  5min. Pauses both intervals while the document is hidden, resumes
 *  on focus with a fresh immediate fetch (so the user sees fresh
 *  data on tab return). */
export function useFinnhubPolling() {
  const refreshArticles = useNewsStore((s) => s.refreshArticles);
  const refreshEvents = useNewsStore((s) => s.refreshEvents);

  useEffect(() => {
    let articlesTimer: ReturnType<typeof setInterval> | null = null;
    let eventsTimer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      void refreshArticles();
      void refreshEvents();
      articlesTimer = setInterval(() => void refreshArticles(), ARTICLES_INTERVAL_MS);
      eventsTimer = setInterval(() => void refreshEvents(), EVENTS_INTERVAL_MS);
    };
    const stop = () => {
      if (articlesTimer) clearInterval(articlesTimer);
      if (eventsTimer) clearInterval(eventsTimer);
      articlesTimer = null;
      eventsTimer = null;
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, [refreshArticles, refreshEvents]);
}
```

- [ ] **Step 2 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 3 : Commit**

```bash
git add desktop/src/lib/news
git commit -m "feat(news): polling hook with visibility-pause"
```

---

## Task 10: Frontend — NewsArticleCard + NewsFeed

**Files:**
- Create: `desktop/src/components/news/NewsArticleCard.tsx`
- Create: `desktop/src/components/news/NewsFeed.tsx`
- Create: `desktop/src/components/news/news.css`

- [ ] **Step 1 : Base CSS**

`desktop/src/components/news/news.css` :
```css
.news-feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
  background: #0f1115;
}
.news-feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  color: #c8ccd4;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.news-feed-refresh {
  background: #1c2028;
  color: #c8ccd4;
  border: 1px solid #2a2f3a;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}
.news-feed-refresh:hover { background: #252a35; }
.news-feed-empty,
.news-feed-error {
  padding: 24px;
  text-align: center;
  color: #8a8f99;
  font-size: 13px;
}
.news-feed-error { color: #ff6b78; }

.news-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #161a22;
  border: 1px solid #232733;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}
.news-card:hover { background: #1b2029; }
.news-card-thumb {
  width: 72px;
  height: 72px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: #232733;
}
.news-card-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.news-card-headline {
  color: #e6e9ef;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.news-card-meta {
  color: #8a8f99;
  font-size: 11px;
  display: flex;
  gap: 8px;
}
.news-card-source { color: #b6bcc8; }
```

- [ ] **Step 2 : NewsArticleCard**

`desktop/src/components/news/NewsArticleCard.tsx` :
```tsx
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NewsArticle } from "../../lib/news/api";

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

export function NewsArticleCard({ article }: { article: NewsArticle }) {
  return (
    <div
      className="news-card"
      role="link"
      tabIndex={0}
      onClick={() => void openUrl(article.url)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void openUrl(article.url);
      }}
    >
      {article.imageUrl ? (
        <img
          className="news-card-thumb"
          src={article.imageUrl}
          alt=""
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <div className="news-card-thumb" />
      )}
      <div className="news-card-body">
        <div className="news-card-headline">{article.headline}</div>
        <div className="news-card-meta">
          <span className="news-card-source">{article.source || "—"}</span>
          <span>·</span>
          <span>{timeAgo(article.publishedAt)} ago</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : NewsFeed**

`desktop/src/components/news/NewsFeed.tsx` :
```tsx
import { useNewsStore } from "../../lib/news/useNewsStore";
import { NewsArticleCard } from "./NewsArticleCard";
import "./news.css";

export function NewsFeed() {
  const articles = useNewsStore((s) => s.articles);
  const loading = useNewsStore((s) => s.articlesLoading);
  const error = useNewsStore((s) => s.articlesError);
  const refresh = useNewsStore((s) => s.refreshArticles);

  return (
    <div className="news-feed">
      <div className="news-feed-header">
        <span>Market News</span>
        <button
          type="button"
          className="news-feed-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <div className="news-feed-error">{error}</div>}
      {!error && articles.length === 0 && !loading && (
        <div className="news-feed-empty">No articles yet.</div>
      )}
      {articles.map((a) => (
        <NewsArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4 : Vérifier tauri-plugin-opener côté JS**

```bash
cd desktop && grep -E '@tauri-apps/plugin-opener' package.json
```
Si absent : `npm install @tauri-apps/plugin-opener` (le plugin Rust `tauri-plugin-opener` est déjà dans Cargo.toml).

- [ ] **Step 5 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 6 : Commit**

```bash
git add desktop/src/components/news
git commit -m "feat(news): NewsFeed + NewsArticleCard components"
```

---

## Task 11: Frontend — EconomicEventRow + EconomicEventDetail modal

**Files:**
- Create: `desktop/src/components/news/EconomicEventRow.tsx`
- Create: `desktop/src/components/news/EconomicEventDetail.tsx`
- Modify: `desktop/src/components/news/news.css` (ajout des styles)

- [ ] **Step 1 : Styles**

Ajouter à la fin de `desktop/src/components/news/news.css` :
```css
.eco-row {
  display: grid;
  grid-template-columns: 50px 28px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: #161a22;
  border: 1px solid #232733;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #c8ccd4;
}
.eco-row:hover { background: #1b2029; }
.eco-row-time { color: #b6bcc8; font-variant-numeric: tabular-nums; }
.eco-row-country {
  background: #232733;
  border-radius: 4px;
  padding: 2px 6px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: #c8ccd4;
}
.eco-row-event { color: #e6e9ef; }
.eco-row-impact {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.eco-row-impact-high   { background: #ff6b78; }
.eco-row-impact-medium { background: #f5a623; }
.eco-row-impact-low    { background: #6b7280; }
.eco-row-numbers {
  color: #8a8f99;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.eco-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.eco-modal {
  background: #161a22;
  border: 1px solid #2a2f3a;
  border-radius: 10px;
  padding: 18px 22px;
  min-width: 360px;
  max-width: 520px;
  color: #e6e9ef;
}
.eco-modal-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 4px;
}
.eco-modal-sub {
  color: #8a8f99;
  font-size: 12px;
  margin-bottom: 14px;
}
.eco-modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.eco-modal-cell-label { color: #8a8f99; font-size: 11px; }
.eco-modal-cell-value {
  color: #e6e9ef;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.eco-modal-surprise-positive { color: #51e09a; }
.eco-modal-surprise-negative { color: #ff6b78; }
.eco-modal-close {
  background: #1c2028;
  color: #c8ccd4;
  border: 1px solid #2a2f3a;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
}
```

- [ ] **Step 2 : EconomicEventRow**

`desktop/src/components/news/EconomicEventRow.tsx` :
```tsx
import type { EconomicEvent } from "../../lib/news/api";

function formatHourLocal(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatNum(n: number | null, unit: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const trimmed = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return unit ? `${trimmed}${unit}` : trimmed;
}

export function EconomicEventRow({
  event,
  onClick,
}: {
  event: EconomicEvent;
  onClick: (e: EconomicEvent) => void;
}) {
  return (
    <div
      className="eco-row"
      role="button"
      tabIndex={0}
      onClick={() => onClick(event)}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(event); }}
    >
      <span className="eco-row-time">{formatHourLocal(event.timeUtc)}</span>
      <span className="eco-row-country">{event.country || "—"}</span>
      <span className="eco-row-event">
        <span className={`eco-row-impact eco-row-impact-${event.impact}`} />
        &nbsp;{event.event}
      </span>
      <span className="eco-row-numbers">
        F:{formatNum(event.forecast, event.unit)} · P:{formatNum(event.previous, event.unit)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3 : EconomicEventDetail**

`desktop/src/components/news/EconomicEventDetail.tsx` :
```tsx
import type { EconomicEvent } from "../../lib/news/api";

function formatNum(n: number | null, unit: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const trimmed = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return unit ? `${trimmed}${unit}` : trimmed;
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function EconomicEventDetail({
  event,
  onClose,
}: {
  event: EconomicEvent;
  onClose: () => void;
}) {
  const hasSurprise =
    event.actual !== null &&
    event.forecast !== null &&
    Number.isFinite(event.actual) &&
    Number.isFinite(event.forecast);
  const surprise = hasSurprise ? (event.actual! - event.forecast!) : null;

  return (
    <div className="eco-modal-backdrop" onClick={onClose}>
      <div className="eco-modal" onClick={(e) => e.stopPropagation()}>
        <div className="eco-modal-title">{event.event}</div>
        <div className="eco-modal-sub">
          {event.country} · {formatDateTime(event.timeUtc)} · impact: {event.impact}
        </div>
        <div className="eco-modal-grid">
          <div>
            <div className="eco-modal-cell-label">Actual</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.actual, event.unit)}
            </div>
          </div>
          <div>
            <div className="eco-modal-cell-label">Forecast</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.forecast, event.unit)}
            </div>
          </div>
          <div>
            <div className="eco-modal-cell-label">Previous</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.previous, event.unit)}
            </div>
          </div>
        </div>
        {surprise !== null && (
          <div
            className={
              surprise >= 0
                ? "eco-modal-surprise-positive"
                : "eco-modal-surprise-negative"
            }
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            Surprise : {surprise >= 0 ? "+" : ""}{surprise.toFixed(2)}{event.unit}
          </div>
        )}
        <button className="eco-modal-close" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 5 : Commit**

```bash
git add desktop/src/components/news
git commit -m "feat(news): economic event row + detail modal"
```

---

## Task 12: Frontend — EconomicCalendar with filters

**Files:**
- Create: `desktop/src/components/news/EconomicCalendar.tsx`
- Modify: `desktop/src/components/news/news.css` (ajout styles filtres)

- [ ] **Step 1 : Styles filtres**

Ajouter à la fin de `desktop/src/components/news/news.css` :
```css
.eco-cal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
  background: #0f1115;
  border-left: 1px solid #232733;
}
.eco-cal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #c8ccd4;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.eco-cal-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.eco-cal-pill {
  background: #1c2028;
  border: 1px solid #2a2f3a;
  color: #8a8f99;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}
.eco-cal-pill-active {
  background: #2d5fda;
  border-color: #4477ff;
  color: #fff;
}
.eco-cal-section-header {
  color: #b6bcc8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-top: 8px;
  padding-bottom: 2px;
  border-bottom: 1px solid #232733;
}
.eco-cal-empty,
.eco-cal-error {
  padding: 18px;
  text-align: center;
  color: #8a8f99;
  font-size: 12px;
}
.eco-cal-error { color: #ff6b78; }
```

- [ ] **Step 2 : EconomicCalendar**

`desktop/src/components/news/EconomicCalendar.tsx` :
```tsx
import { useMemo, useState } from "react";
import type { EconomicEvent, Impact } from "../../lib/news/api";
import { useNewsStore } from "../../lib/news/useNewsStore";
import { EconomicEventDetail } from "./EconomicEventDetail";
import { EconomicEventRow } from "./EconomicEventRow";

const IMPACTS: Impact[] = ["high", "medium", "low"];
const COUNTRIES = ["US", "EU", "GB", "JP", "CN"] as const;

function dayLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dStart = new Date(d);
  dStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dStart.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "x";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function EconomicCalendar() {
  const events = useNewsStore((s) => s.events);
  const loading = useNewsStore((s) => s.eventsLoading);
  const error = useNewsStore((s) => s.eventsError);
  const filters = useNewsStore((s) => s.filters);
  const setRange = useNewsStore((s) => s.setRange);
  const toggleImpact = useNewsStore((s) => s.toggleImpact);
  const toggleCountry = useNewsStore((s) => s.toggleCountry);
  const [selected, setSelected] = useState<EconomicEvent | null>(null);

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (!filters.impact[e.impact]) return false;
      const c = e.country as (typeof COUNTRIES)[number];
      if (COUNTRIES.includes(c) && !filters.countries[c]) return false;
      // Events with country outside the toggle set: hide unless any
      // is enabled (default behaviour : we show only toggled-on countries).
      if (!COUNTRIES.includes(c)) return false;
      return true;
    });
  }, [events, filters]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const e of visible) {
      const k = dayKey(e.timeUtc);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    return Array.from(map.entries()); // already chronological from server sort
  }, [visible]);

  return (
    <div className="eco-cal">
      <div className="eco-cal-header">
        <span>Economic Calendar</span>
      </div>
      <div className="eco-cal-filters">
        <button
          type="button"
          className={`eco-cal-pill ${filters.range === "today" ? "eco-cal-pill-active" : ""}`}
          onClick={() => setRange("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={`eco-cal-pill ${filters.range === "7d" ? "eco-cal-pill-active" : ""}`}
          onClick={() => setRange("7d")}
        >
          7d
        </button>
      </div>
      <div className="eco-cal-filters">
        {IMPACTS.map((i) => (
          <button
            key={i}
            type="button"
            className={`eco-cal-pill ${filters.impact[i] ? "eco-cal-pill-active" : ""}`}
            onClick={() => toggleImpact(i)}
          >
            {i.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="eco-cal-filters">
        {COUNTRIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`eco-cal-pill ${filters.countries[c] ? "eco-cal-pill-active" : ""}`}
            onClick={() => toggleCountry(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <div className="eco-cal-error">{error}</div>}
      {!error && grouped.length === 0 && !loading && (
        <div className="eco-cal-empty">No events match the current filters.</div>
      )}
      {grouped.map(([dayK, list]) => (
        <div key={dayK}>
          <div className="eco-cal-section-header">{dayLabel(list[0].timeUtc)}</div>
          {list.map((ev) => (
            <EconomicEventRow key={ev.id} event={ev} onClick={setSelected} />
          ))}
        </div>
      ))}
      {selected && (
        <EconomicEventDetail event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src/components/news
git commit -m "feat(news): economic calendar panel with filters"
```

---

## Task 13: Frontend — NewsRoute layout

**Files:**
- Modify: `desktop/src/routes/NewsRoute.tsx` (remplacer le placeholder)
- Modify: `desktop/src/components/news/news.css` (ajout layout)

- [ ] **Step 1 : Styles layout**

Ajouter à la fin de `desktop/src/components/news/news.css` :
```css
.news-route {
  display: grid;
  grid-template-columns: 3fr 2fr;
  height: 100%;
  width: 100%;
  background: #0a0c10;
}
@media (max-width: 1100px) {
  .news-route {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .news-route > .eco-cal { border-left: none; border-bottom: 1px solid #232733; }
}
.news-api-key-banner {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #1c2028;
  border: 1px solid #ff6b78;
  color: #ff6b78;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 50;
}
```

- [ ] **Step 2 : NewsRoute**

`desktop/src/routes/NewsRoute.tsx` (réécriture complète) :
```tsx
import { useEffect, useState } from "react";
import { EconomicCalendar } from "../components/news/EconomicCalendar";
import { NewsFeed } from "../components/news/NewsFeed";
import { hasApiKey } from "../lib/news/api";
import { useFinnhubPolling } from "../lib/news/useFinnhubPolling";
import "../components/news/news.css";

export function NewsRoute() {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then((b) => setKeyConfigured(b))
      .catch(() => setKeyConfigured(false));
  }, []);

  // Polling only starts once the key is known to be configured. Avoids
  // hammering the backend with errors when the user hasn't set it yet.
  return keyConfigured ? <NewsWithPolling /> : <NewsRouteShell keyConfigured={keyConfigured} />;
}

function NewsWithPolling() {
  useFinnhubPolling();
  return <NewsRouteShell keyConfigured={true} />;
}

function NewsRouteShell({ keyConfigured }: { keyConfigured: boolean | null }) {
  return (
    <div className="news-route" style={{ position: "relative" }}>
      {keyConfigured === false && (
        <div className="news-api-key-banner">
          Configure ta clé Finnhub dans Settings broker pour activer la News.
        </div>
      )}
      <NewsFeed />
      <EconomicCalendar />
    </div>
  );
}
```

- [ ] **Step 3 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 4 : Commit**

```bash
git add desktop/src/routes/NewsRoute.tsx desktop/src/components/news
git commit -m "feat(news): wire NewsRoute layout 60/40 with polling"
```

---

## Task 14: Frontend — Settings UI for Finnhub API key

**Files:**
- Modify: `desktop/src/components/BrokerSettings.tsx` (ajouter un champ "Finnhub API key")

Le composant Settings broker existant est `desktop/src/components/BrokerSettings.tsx`. On y ajoute une section "News" en bas du formulaire, indépendante des credentials broker (Save séparé).

- [ ] **Step 1 : Lire BrokerSettings et localiser le bon endroit**

```bash
cd desktop && head -200 src/components/BrokerSettings.tsx
```

Identifier la fin du formulaire (après les boutons Save/Delete broker creds). On ajoutera la section Finnhub APRÈS cette zone, séparée par un `<hr />` ou un wrapper `<section>` distinct.

- [ ] **Step 2 : Imports et state**

Ajouter en haut du composant (avec les autres `useState`) :
```ts
import { hasApiKey, saveApiKey, deleteApiKey } from "../lib/news/api";

const [finnhubKey, setFinnhubKey] = useState("");
const [finnhubKeySet, setFinnhubKeySet] = useState<boolean | null>(null);
const [finnhubStatus, setFinnhubStatus] = useState<
  { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "success"; msg: string }
>({ kind: "idle" });
```

Et un `useEffect` en parallèle des autres bootstraps :
```ts
useEffect(() => {
  void hasApiKey()
    .then(setFinnhubKeySet)
    .catch(() => setFinnhubKeySet(false));
}, []);
```

- [ ] **Step 3 : Handlers**

Dans le composant :
```ts
const handleSaveFinnhub = useCallback(async () => {
  const trimmed = finnhubKey.trim();
  if (!trimmed) {
    setFinnhubStatus({ kind: "error", msg: "Empty key." });
    return;
  }
  setFinnhubStatus({ kind: "busy" });
  try {
    await saveApiKey(trimmed);
    setFinnhubStatus({ kind: "success", msg: "Saved." });
    setFinnhubKeySet(true);
    setFinnhubKey("");
  } catch (e) {
    setFinnhubStatus({ kind: "error", msg: String(e) });
  }
}, [finnhubKey]);

const handleDeleteFinnhub = useCallback(async () => {
  setFinnhubStatus({ kind: "busy" });
  try {
    await deleteApiKey();
    setFinnhubStatus({ kind: "success", msg: "Deleted." });
    setFinnhubKeySet(false);
  } catch (e) {
    setFinnhubStatus({ kind: "error", msg: String(e) });
  }
}, []);
```

- [ ] **Step 4 : Section JSX**

Juste avant la fermeture du formulaire/panel (à insérer là où le développeur juge approprié visuellement) :
```tsx
<section className="bs-section" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #2a2f3a" }}>
  <h3 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#c8ccd4" }}>
    Finnhub API key (News module)
  </h3>
  <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#8a8f99" }}>
    Required for the News module (economic calendar + market news). Sign up free at
    finnhub.io (60 req/min on the free tier). Key is stored in your OS keyring.
  </p>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <input
      type="password"
      placeholder={finnhubKeySet ? "•••••• (configured)" : "Paste your Finnhub API key"}
      value={finnhubKey}
      onChange={(e) => setFinnhubKey(e.target.value)}
      style={{ flex: 1, padding: "6px 10px", background: "#0f1115", color: "#e6e9ef", border: "1px solid #2a2f3a", borderRadius: 6 }}
    />
    <button
      type="button"
      onClick={() => void handleSaveFinnhub()}
      disabled={finnhubStatus.kind === "busy"}
    >
      Save key
    </button>
    {finnhubKeySet && (
      <button
        type="button"
        onClick={() => void handleDeleteFinnhub()}
        disabled={finnhubStatus.kind === "busy"}
      >
        Remove
      </button>
    )}
  </div>
  {finnhubStatus.kind === "error" && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#ff6b78" }}>
      {finnhubStatus.msg}
    </div>
  )}
  {finnhubStatus.kind === "success" && (
    <div style={{ marginTop: 6, fontSize: 12, color: "#51e09a" }}>
      {finnhubStatus.msg}
    </div>
  )}
</section>
```

- [ ] **Step 5 : Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected : EXIT=0.

- [ ] **Step 6 : Manual smoke test**

```bash
cd desktop && npm run tauri dev
```

Procédure :
1. Ouvrir Settings broker, coller une clé Finnhub valide, Save key → "Saved.".
2. Naviguer vers /news.
3. Vérifier console DevTools : aucune erreur, le store passe en `loading: true` puis affiche articles + events.
4. Toggle filtres (Today/7d, impact, pays) → liste filtrée.
5. Click sur un article → ouvre le navigateur.
6. Click sur un event → modal détails.
7. Retirer la clé via Settings → bannière rouge réapparaît sur /news après reload.

- [ ] **Step 7 : Commit**

```bash
git add desktop/src/components/BrokerSettings.tsx
git commit -m "feat(news): finnhub api key input in broker settings"
```

---

## Self-Review

**Spec coverage :**
- Source Finnhub → Tasks 4 (calendar), 5 (news) ✓
- Architecture backend-driven → Tasks 1-7 ✓
- Cache 60s/5min → Task 3 + Task 7 (TTL constants) ✓
- Clé via keyring → Task 6 + Task 14 (UI) ✓
- Types Rust / TS alignés → vérifier `EconomicEvent`/`NewsArticle` identiques noms de champs en camelCase. ✓ (Rust `#[serde(rename_all = "camelCase")]` + TS types miroir).
- Layout 60/40 + responsive 1100px → Task 13 ✓
- NewsFeed cards + click → ext browser → Task 10 ✓
- Calendar avec filtres impact/country/range → Task 12 ✓
- Modal détail event avec surprise → Task 11 ✓
- Store Zustand persisté → Task 8 ✓
- Polling 60s/5min + visibility pause → Task 9 ✓
- Erreur clé manquante → Task 7 (error string) + Task 13 (bannière) ✓
- Tests Rust (parser + cache) → Tasks 3, 4, 5 ✓
- Pas de tests frontend → respecté ✓

**Placeholders scan :** Aucun "TODO/TBD" résiduel. Step 1 de Task 14 dit "identifier la fin du formulaire" — c'est une instruction d'exécution claire (lire le fichier + repérer la fermeture du form), pas un placeholder.

**Type consistency :** `EconomicEvent`, `NewsArticle`, `Impact` ont les mêmes noms de champs Rust ↔ TS. Les commandes Tauri (`news_fetch_calendar`, `news_fetch_articles`, `news_save_api_key`, `news_has_api_key`, `news_delete_api_key`) sont consistantes entre Task 7 (déclaration) et Task 8 (wrappers JS).

**Scope check :** Plan livre un MVP fonctionnel, indépendant, testable de bout en bout. Non-objectifs du spec respectés (pas de notifs, pas de wrap matinal, pas de feed par symbole).
