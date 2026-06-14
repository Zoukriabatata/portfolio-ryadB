# Account Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Account dashboard for Apex/Rithmic showing live balance, daily PnL, trailing drawdown, open positions, working orders, equity curve, and day stats.

**Architecture:** Two new long-lived Tauri-managed Rust adapters (PnL plant + Order subscription), pattern-matched on the existing `RithmicAdapter`. Both broadcast snapshots to React via Tauri events. React state lives in a Zustand store fed by event listeners. Layout = single AccountRoute with 4 panels.

**Tech Stack:**
- Backend : Rust, Tauri 2, `tokio-tungstenite`, `prost`, `tokio::broadcast`, `tracing`. The existing modules `connectors/rithmic/adapter.rs` and `connectors/rithmic/order_plant.rs` are the canonical references for connection lifecycle, heartbeat, and frame parsing.
- Frontend : React 19, TypeScript strict, Zustand 5, Tauri `invoke` + event `listen`.
- Spec : `docs/superpowers/specs/2026-05-18-account-module-design.md`.

**Conventions :**
- Paths relative to repo root (`orderflow-v2/`).
- Rust commands run from `desktop/src-tauri/`. Frontend commands from `desktop/`.
- Commit style : `feat(scope): message`. Stage only files listed per task (NEVER `git add -A` — branch has unrelated dirty work).
- Branch : `feat/heatmap-refonte-7` (keep, do not switch).

---

## Task 1: Backend — Account types + module skeleton

**Files:**
- Create: `desktop/src-tauri/src/connectors/rithmic/account_types.rs`
- Modify: `desktop/src-tauri/src/connectors/rithmic/mod.rs` (declare submodule + re-exports)

- [ ] **Step 1: Create the types module**

`desktop/src-tauri/src/connectors/rithmic/account_types.rs`:
```rust
//! Public types shared between the PnL plant + Order subscribe
//! adapters and the Tauri command layer. Serialized in camelCase
//! for the React layer.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub fcm: String,
    pub ib_id: String,
    pub system_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStats {
    pub account_id: String,
    pub balance: f64,
    pub start_of_day_balance: f64,
    pub daily_pnl: f64,
    pub daily_loss_limit: Option<f64>,
    pub trailing_drawdown: Option<f64>,
    pub trailing_drawdown_limit: Option<f64>,
    pub margin_used: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PositionSide { Long, Short, Flat }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub account_id: String,
    pub symbol: String,
    pub exchange: String,
    pub side: PositionSide,
    pub qty: f64,
    pub avg_price: f64,
    pub market_price: f64,
    pub unrealized_pnl: f64,
    pub realized_pnl_today: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderSide { Buy, Sell }

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderType { Limit, Stop, Market, StopLimit }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingOrder {
    pub account_id: String,
    pub order_id: String,
    pub symbol: String,
    pub exchange: String,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub qty: f64,
    pub filled_qty: f64,
    pub limit_price: Option<f64>,
    pub stop_price: Option<f64>,
    pub status: String,
    pub placed_at: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FeedStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}
```

- [ ] **Step 2: Declare the submodule**

Read `desktop/src-tauri/src/connectors/rithmic/mod.rs`. Add `pub mod account_types;` alongside other submodule declarations (preserve alphabetical or existing order).

- [ ] **Step 3: Compile check**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors. Dead-code warnings on the new types are acceptable — they get used in later tasks.

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/connectors/rithmic/account_types.rs desktop/src-tauri/src/connectors/rithmic/mod.rs
git commit -m "feat(account): account/position/order types module"
```

---

## Task 2: Backend — PnL plant adapter (long-lived)

**Files:**
- Create: `desktop/src-tauri/src/connectors/rithmic/pnl_plant.rs`
- Modify: `desktop/src-tauri/src/connectors/rithmic/mod.rs`

**Reference pattern**: `desktop/src-tauri/src/connectors/rithmic/adapter.rs` (Ticker Plant adapter). Study its `RithmicAdapter` shape — `client`, optional `session`, broadcast Sender, reader JoinHandle, heartbeat handle. Mirror the same lifecycle: `new`, `connect`, `login`, `subscribe`, `run`, `disconnect`. The PnL plant differs only in `SysInfraType::PnlPlant`, the templates exchanged, and the message types broadcast.

**Templates exchanged** (Rithmic R|API reference):
```
REQUEST_LOGIN  = 10   RESPONSE_LOGIN  = 11   REQUEST_LOGOUT = 12
REQUEST_ACCOUNT_LIST            = 302   RESPONSE_ACCOUNT_LIST            = 303
REQUEST_ACCOUNT_RMS_INFO        = 304   RESPONSE_ACCOUNT_RMS_INFO        = 305
REQUEST_PNL_POSITION_UPDATES    = 400   RESPONSE_PNL_POSITION_UPDATES    = 401
REQUEST_PNL_POSITION_SNAPSHOT   = 402   RESPONSE_PNL_POSITION_SNAPSHOT   = 403
INSTRUMENT_PNL_POSITION_UPDATE  = 450
ACCOUNT_PNL_POSITION_UPDATE     = 451
```

The Rust proto types live in `desktop/src-tauri/src/connectors/rithmic/proto/mod.rs` (generated from `desktop/rithmic-sdk/proto/`). Confirm by grepping for the type names — if any of `RequestPnlPositionUpdates`, `ResponsePnlPositionUpdates`, `AccountPnLPositionUpdate`, `InstrumentPnLPositionUpdate` doesn't exist in `proto/mod.rs`, STOP and report BLOCKED — the proto build needs the corresponding `.proto` file to be added to `build.rs`.

- [ ] **Step 1: Verify proto types exist**

```bash
cd desktop/src-tauri && grep -E "(RequestPnlPositionUpdates|ResponsePnlPositionUpdates|AccountPnLPositionUpdate|InstrumentPnLPositionUpdate|RequestAccountList|RequestAccountRmsInfo|ResponseAccountList|ResponseAccountRmsInfo)" src/connectors/rithmic/proto/mod.rs | head -10
```

Expected: at least 8 matching type names. If any are missing, STOP and report BLOCKED with the missing names so the proto build script can be updated.

- [ ] **Step 2: Scaffold the adapter struct + new/connect**

`desktop/src-tauri/src/connectors/rithmic/pnl_plant.rs`:
```rust
//! Long-lived PnL plant adapter. Mirrors `RithmicAdapter` (Ticker
//! Plant) — own WebSocket socket, own login, own reader task. Streams
//! account-level + instrument-level PnL updates to subscribers via
//! tokio::broadcast channels.

use std::time::Duration;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::account_types::{Account, AccountStats, Position};
use crate::connectors::rithmic::client::RithmicClient;
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, RequestAccountList, RequestAccountRmsInfo, RequestLogin,
    RequestLogout, RequestPnlPositionUpdates, ResponseAccountList, ResponseLogin,
};
use prost::Message as ProstMessage;

const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";
const STATS_CHANNEL_CAPACITY: usize = 256;
const POSITIONS_CHANNEL_CAPACITY: usize = 256;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

mod template {
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;
    pub const REQUEST_ACCOUNT_LIST: i32 = 302;
    pub const RESPONSE_ACCOUNT_LIST: i32 = 303;
    pub const REQUEST_ACCOUNT_RMS_INFO: i32 = 304;
    pub const RESPONSE_ACCOUNT_RMS_INFO: i32 = 305;
    pub const REQUEST_PNL_POSITION_UPDATES: i32 = 400;
    pub const RESPONSE_PNL_POSITION_UPDATES: i32 = 401;
    pub const INSTRUMENT_PNL_POSITION_UPDATE: i32 = 450;
    pub const ACCOUNT_PNL_POSITION_UPDATE: i32 = 451;
}

pub struct PnlPlantAdapter {
    client: RithmicClient,
    stats_tx: broadcast::Sender<AccountStats>,
    positions_tx: broadcast::Sender<Position>,
    reader_handle: Option<JoinHandle<()>>,
}

impl PnlPlantAdapter {
    pub fn new() -> Self {
        let (stats_tx, _) = broadcast::channel(STATS_CHANNEL_CAPACITY);
        let (positions_tx, _) = broadcast::channel(POSITIONS_CHANNEL_CAPACITY);
        Self {
            client: RithmicClient::new(),
            stats_tx,
            positions_tx,
            reader_handle: None,
        }
    }

    pub fn stats_rx(&self) -> broadcast::Receiver<AccountStats> {
        self.stats_tx.subscribe()
    }
    pub fn positions_rx(&self) -> broadcast::Receiver<Position> {
        self.positions_tx.subscribe()
    }

    pub async fn connect(&mut self, gateway_url: &str) -> Result<()> {
        self.client.connect(gateway_url).await
    }
}
```

- [ ] **Step 3: Implement login + account_list**

Append to the same file:
```rust
impl PnlPlantAdapter {
    pub async fn login(&mut self, creds: &Credentials) -> Result<()> {
        let req = RequestLogin {
            template_id: template::REQUEST_LOGIN,
            template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
            user_msg: vec!["pnl-plant".into()],
            user: Some(creds.username.clone()),
            password: Some(creds.password.clone()),
            app_name: Some(creds.app_name.clone()),
            app_version: Some(creds.app_version.clone()),
            system_name: Some(creds.system_name.clone()),
            infra_type: Some(SysInfraType::PnlPlant as i32),
            mac_addr: vec![],
            os_version: None,
            os_platform: None,
            aggregated_quotes: None,
        };
        self.client.send(&req).await?;
        let resp: ResponseLogin = self.client.recv().await?;
        if resp.template_id != template::RESPONSE_LOGIN {
            return Err(ConnectorError::UnexpectedMessage(resp.template_id));
        }
        if !resp.rp_code.iter().any(|c| c == "0") {
            return Err(ConnectorError::AuthFailed(format!(
                "pnl-plant login rejected: rp_code={:?} user_msg={:?}",
                resp.rp_code, resp.user_msg
            )));
        }
        tracing::info!("pnl-plant: login OK");
        Ok(())
    }

    /// One-shot: ask for the account list. Blocks until the response
    /// (multiple ResponseAccountList frames, one per account) drains.
    pub async fn fetch_account_list(&mut self) -> Result<Vec<Account>> {
        let req = RequestAccountList {
            template_id: template::REQUEST_ACCOUNT_LIST,
            user_msg: vec!["pnl-plant".into()],
            fcm_id: None,
            ib_id: None,
            user_type: None,
        };
        self.client.send(&req).await?;
        let mut accounts: Vec<Account> = Vec::new();
        loop {
            let raw = self.client.recv_raw().await?;
            let probe = crate::connectors::rithmic::client::TemplateProbe::decode(raw.as_slice())?;
            if probe.template_id != template::RESPONSE_ACCOUNT_LIST { continue; }
            let frame = ResponseAccountList::decode(raw.as_slice())?;
            // The terminator frame has rp_code populated and no account_id.
            if !frame.rp_code.is_empty() && frame.account_id.is_none() {
                break;
            }
            if let Some(account_id) = frame.account_id {
                accounts.push(Account {
                    id: account_id,
                    fcm: frame.fcm_id.unwrap_or_default(),
                    ib_id: frame.ib_id.unwrap_or_default(),
                    system_name: frame.account_name.unwrap_or_default(),
                });
            }
        }
        Ok(accounts)
    }
}
```

- [ ] **Step 4: Implement subscribe_updates + reader loop**

Append to the same file:
```rust
impl PnlPlantAdapter {
    /// Subscribe to live PnL updates for the given account. Spawns a
    /// background reader task that drains frames forever and pushes
    /// AccountStats / Position into the broadcast channels.
    pub async fn subscribe_and_run(&mut self, account_id: &str, fcm: &str, ib: &str) -> Result<()> {
        let req = RequestPnlPositionUpdates {
            template_id: template::REQUEST_PNL_POSITION_UPDATES,
            user_msg: vec!["pnl-plant".into()],
            fcm_id: Some(fcm.to_string()),
            ib_id: Some(ib.to_string()),
            account_id: Some(account_id.to_string()),
            request: Some(crate::connectors::rithmic::proto::request_pnl_position_updates::Request::Subscribe as i32),
        };
        self.client.send(&req).await?;
        tracing::info!("pnl-plant: subscribe sent for account {}", account_id);

        // Spawn the reader task.
        let mut client = self.client.take_for_reader()?;
        let stats_tx = self.stats_tx.clone();
        let positions_tx = self.positions_tx.clone();
        let account_id_owned = account_id.to_string();
        let handle = tokio::spawn(async move {
            loop {
                let raw = match client.recv_raw().await {
                    Ok(b) => b,
                    Err(e) => {
                        tracing::warn!("pnl-plant reader: recv error {e}");
                        break;
                    }
                };
                let probe = match crate::connectors::rithmic::client::TemplateProbe::decode(raw.as_slice()) {
                    Ok(p) => p,
                    Err(e) => { tracing::warn!("pnl probe decode: {e}"); continue; }
                };
                match probe.template_id {
                    template::ACCOUNT_PNL_POSITION_UPDATE => {
                        if let Ok(stats) = decode_account_update(&raw, &account_id_owned) {
                            let _ = stats_tx.send(stats);
                        }
                    }
                    template::INSTRUMENT_PNL_POSITION_UPDATE => {
                        if let Ok(pos) = decode_instrument_update(&raw, &account_id_owned) {
                            let _ = positions_tx.send(pos);
                        }
                    }
                    _ => {}
                }
            }
            tracing::info!("pnl-plant reader: exiting");
        });
        self.reader_handle = Some(handle);
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        let _ = self.client.send(&RequestLogout {
            template_id: template::REQUEST_LOGOUT,
            user_msg: vec![],
        }).await;
        let _ = self.client.close().await;
        if let Some(h) = self.reader_handle.take() {
            let _ = tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, h).await;
        }
        Ok(())
    }
}

fn decode_account_update(raw: &[u8], account_id: &str) -> Result<AccountStats> {
    use crate::connectors::rithmic::proto::AccountPnLPositionUpdate;
    let f = AccountPnLPositionUpdate::decode(raw)?;
    Ok(AccountStats {
        account_id: f.account_id.unwrap_or_else(|| account_id.to_string()),
        balance: f.account_balance.unwrap_or(0.0),
        start_of_day_balance: f.start_of_day_balance.unwrap_or(0.0),
        daily_pnl: f.day_pn_l.unwrap_or(0.0),
        daily_loss_limit: f.loss_limit,
        trailing_drawdown: f.min_account_balance,
        trailing_drawdown_limit: f.min_margin_balance,
        margin_used: f.margin_balance,
    })
}

fn decode_instrument_update(raw: &[u8], account_id: &str) -> Result<Position> {
    use crate::connectors::rithmic::account_types::PositionSide;
    use crate::connectors::rithmic::proto::InstrumentPnLPositionUpdate;
    let f = InstrumentPnLPositionUpdate::decode(raw)?;
    let qty = f.fill_size.unwrap_or(0) as f64;
    let side = if qty > 0.0 { PositionSide::Long }
               else if qty < 0.0 { PositionSide::Short }
               else { PositionSide::Flat };
    Ok(Position {
        account_id: f.account_id.unwrap_or_else(|| account_id.to_string()),
        symbol: f.symbol.unwrap_or_default(),
        exchange: f.exchange.unwrap_or_default(),
        side,
        qty: qty.abs(),
        avg_price: f.avg_open_fill_price.unwrap_or(0.0),
        market_price: f.market_value.unwrap_or(0.0),
        unrealized_pnl: f.open_position_pn_l.unwrap_or(0.0),
        realized_pnl_today: f.closed_position_pn_l.unwrap_or(0.0),
    })
}
```

NOTE: The exact field names on `AccountPnLPositionUpdate` and `InstrumentPnLPositionUpdate` depend on the proto definitions. If a field doesn't exist or has a different name, run `grep -A 30 "pub struct AccountPnLPositionUpdate" desktop/src-tauri/src/connectors/rithmic/proto/mod.rs` and adapt the decoder accordingly. STOP and report BLOCKED if multiple fields are missing — the proto schema may need updating.

- [ ] **Step 5: Re-export and compile check**

Add to `desktop/src-tauri/src/connectors/rithmic/mod.rs`:
```rust
pub mod pnl_plant;
```

Then:
```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors. Field-name mismatches will surface here — fix them based on the actual `proto/mod.rs` struct.

- [ ] **Step 6: Commit**

```bash
git add desktop/src-tauri/src/connectors/rithmic/pnl_plant.rs desktop/src-tauri/src/connectors/rithmic/mod.rs
git commit -m "feat(account): pnl plant adapter (login + account list + subscribe)"
```

---

## Task 3: Backend — Order subscribe adapter (long-lived)

**Files:**
- Create: `desktop/src-tauri/src/connectors/rithmic/order_subscribe.rs`
- Modify: `desktop/src-tauri/src/connectors/rithmic/mod.rs`

This is structurally identical to Task 2 but on `SysInfraType::OrderPlant` and consuming `RithmicOrderNotification` / `ExchangeOrderNotification` frames. Reference: the existing `desktop/src-tauri/src/connectors/rithmic/order_plant.rs` already does the one-shot pull — copy its login flow but instead of asking for order history, send `RequestSubscribeForOrderUpdates` (template 308) and drain notifications forever.

**Templates:**
```
REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES  = 308
RESPONSE_SUBSCRIBE_FOR_ORDER_UPDATES = 309
EXCHANGE_ORDER_NOTIFICATION          = 351
RITHMIC_ORDER_NOTIFICATION           = 352
```

- [ ] **Step 1: Verify proto types**

```bash
cd desktop/src-tauri && grep -E "(RequestSubscribeForOrderUpdates|RithmicOrderNotification|ExchangeOrderNotification)" src/connectors/rithmic/proto/mod.rs | head -5
```
Expected: at least 3 matches. STOP if missing.

- [ ] **Step 2: Create the module**

`desktop/src-tauri/src/connectors/rithmic/order_subscribe.rs`:
```rust
//! Long-lived Order plant subscription. Distinct from
//! `order_plant.rs` (one-shot journal sync) — this stays open and
//! streams every order status change for the active account so the
//! Account dashboard can show working orders in real time.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::account_types::{OrderSide, OrderType, WorkingOrder};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, RequestLogin, RequestLogout, RequestSubscribeForOrderUpdates,
    ResponseLogin, RithmicOrderNotification,
};
use prost::Message as ProstMessage;

const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";
const ORDERS_CHANNEL_CAPACITY: usize = 256;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

mod template {
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;
    pub const REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES: i32 = 308;
    pub const RESPONSE_SUBSCRIBE_FOR_ORDER_UPDATES: i32 = 309;
    pub const RITHMIC_ORDER_NOTIFICATION: i32 = 352;
}

pub struct OrderSubscribeAdapter {
    client: RithmicClient,
    /// Snapshot of every order seen (working OR done). Reader thread
    /// updates this so we can emit a complete snapshot of WORKING
    /// orders on each change.
    orders: Arc<Mutex<HashMap<String, WorkingOrder>>>,
    orders_tx: broadcast::Sender<Vec<WorkingOrder>>,
    reader_handle: Option<JoinHandle<()>>,
}

impl OrderSubscribeAdapter {
    pub fn new() -> Self {
        let (orders_tx, _) = broadcast::channel(ORDERS_CHANNEL_CAPACITY);
        Self {
            client: RithmicClient::new(),
            orders: Arc::new(Mutex::new(HashMap::new())),
            orders_tx,
            reader_handle: None,
        }
    }

    pub fn orders_rx(&self) -> broadcast::Receiver<Vec<WorkingOrder>> {
        self.orders_tx.subscribe()
    }

    pub async fn connect(&mut self, gateway_url: &str) -> Result<()> {
        self.client.connect(gateway_url).await
    }

    pub async fn login(&mut self, creds: &Credentials) -> Result<()> {
        let req = RequestLogin {
            template_id: template::REQUEST_LOGIN,
            template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
            user_msg: vec!["order-sub".into()],
            user: Some(creds.username.clone()),
            password: Some(creds.password.clone()),
            app_name: Some(creds.app_name.clone()),
            app_version: Some(creds.app_version.clone()),
            system_name: Some(creds.system_name.clone()),
            infra_type: Some(SysInfraType::OrderPlant as i32),
            mac_addr: vec![],
            os_version: None,
            os_platform: None,
            aggregated_quotes: None,
        };
        self.client.send(&req).await?;
        let resp: ResponseLogin = self.client.recv().await?;
        if resp.template_id != template::RESPONSE_LOGIN {
            return Err(ConnectorError::UnexpectedMessage(resp.template_id));
        }
        if !resp.rp_code.iter().any(|c| c == "0") {
            return Err(ConnectorError::AuthFailed(format!(
                "order-sub login rejected: rp_code={:?} user_msg={:?}",
                resp.rp_code, resp.user_msg
            )));
        }
        tracing::info!("order-sub: login OK");
        Ok(())
    }

    pub async fn subscribe_and_run(&mut self, account_id: &str, fcm: &str, ib: &str) -> Result<()> {
        let req = RequestSubscribeForOrderUpdates {
            template_id: template::REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES,
            user_msg: vec!["order-sub".into()],
            fcm_id: Some(fcm.to_string()),
            ib_id: Some(ib.to_string()),
            account_id: Some(account_id.to_string()),
        };
        self.client.send(&req).await?;
        tracing::info!("order-sub: subscribe sent for account {}", account_id);

        let mut client = self.client.take_for_reader()?;
        let orders = self.orders.clone();
        let orders_tx = self.orders_tx.clone();
        let account_id_owned = account_id.to_string();
        let handle = tokio::spawn(async move {
            loop {
                let raw = match client.recv_raw().await {
                    Ok(b) => b,
                    Err(e) => { tracing::warn!("order-sub reader: {e}"); break; }
                };
                let probe = match TemplateProbe::decode(raw.as_slice()) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                if probe.template_id != template::RITHMIC_ORDER_NOTIFICATION { continue; }
                let frame = match RithmicOrderNotification::decode(raw.as_slice()) {
                    Ok(f) => f,
                    Err(_) => continue,
                };
                let order_id = match &frame.order_id { Some(id) => id.clone(), None => continue };
                let is_working = matches!(
                    frame.status.as_deref(),
                    Some("working" | "pending" | "partially_filled" | "open")
                );
                let mut map = orders.lock().await;
                if is_working {
                    map.insert(order_id, frame_to_working_order(&frame, &account_id_owned));
                } else {
                    map.remove(&order_id);
                }
                let snapshot: Vec<WorkingOrder> = map.values().cloned().collect();
                drop(map);
                let _ = orders_tx.send(snapshot);
            }
            tracing::info!("order-sub reader: exiting");
        });
        self.reader_handle = Some(handle);
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        let _ = self.client.send(&RequestLogout {
            template_id: template::REQUEST_LOGOUT,
            user_msg: vec![],
        }).await;
        let _ = self.client.close().await;
        if let Some(h) = self.reader_handle.take() {
            let _ = tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, h).await;
        }
        Ok(())
    }
}

fn frame_to_working_order(frame: &RithmicOrderNotification, account_id: &str) -> WorkingOrder {
    let side = match frame.transaction_type.as_deref() {
        Some("BUY") | Some("buy") => OrderSide::Buy,
        _ => OrderSide::Sell,
    };
    let order_type = match frame.price_type.as_deref() {
        Some("LIMIT") | Some("limit") => OrderType::Limit,
        Some("STOP") | Some("stop") => OrderType::Stop,
        Some("STOP_LIMIT") | Some("stop_limit") => OrderType::StopLimit,
        _ => OrderType::Market,
    };
    WorkingOrder {
        account_id: frame.account_id.clone().unwrap_or_else(|| account_id.to_string()),
        order_id: frame.order_id.clone().unwrap_or_default(),
        symbol: frame.symbol.clone().unwrap_or_default(),
        exchange: frame.exchange.clone().unwrap_or_default(),
        side,
        order_type,
        qty: frame.quantity.unwrap_or(0) as f64,
        filled_qty: frame.filled_size.unwrap_or(0) as f64,
        limit_price: frame.price,
        stop_price: frame.trigger_price,
        status: frame.status.clone().unwrap_or_default(),
        placed_at: String::new(), // SSboe parsing left for the unit test
    }
}
```

NOTE: As in Task 2, the exact field names on `RithmicOrderNotification` may differ. Grep `proto/mod.rs` to confirm and adapt.

- [ ] **Step 3: Add to mod.rs**

Add `pub mod order_subscribe;` to `desktop/src-tauri/src/connectors/rithmic/mod.rs`.

- [ ] **Step 4: Compile check**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/src/connectors/rithmic/order_subscribe.rs desktop/src-tauri/src/connectors/rithmic/mod.rs
git commit -m "feat(account): order subscribe adapter (long-lived working orders)"
```

---

## Task 4: Backend — Tauri commands + AccountState + wiring

**Files:**
- Create: `desktop/src-tauri/src/commands/account.rs`
- Modify: `desktop/src-tauri/src/commands/mod.rs`
- Modify: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands/account.rs**

`desktop/src-tauri/src/commands/account.rs`:
```rust
//! Tauri commands for the Account dashboard. Owns the long-lived
//! PnL + Order adapters and forwards their broadcasts to the React
//! layer via `AppHandle::emit`.

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::brokers::vault;
use crate::connectors::adapter::Credentials;
use crate::connectors::rithmic::account_types::{Account, AccountStats, FeedStatus, Position, WorkingOrder};
use crate::connectors::rithmic::order_subscribe::OrderSubscribeAdapter;
use crate::connectors::rithmic::pnl_plant::PnlPlantAdapter;

const APP_NAME: &str = "orderflow-v2";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct AccountState {
    pub pnl: Arc<Mutex<Option<PnlPlantAdapter>>>,
    pub order: Arc<Mutex<Option<OrderSubscribeAdapter>>>,
}

impl AccountState {
    pub fn new() -> Self {
        Self {
            pnl: Arc::new(Mutex::new(None)),
            order: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for AccountState {
    fn default() -> Self { Self::new() }
}

fn load_credentials() -> Result<Credentials, String> {
    let stored = vault::load()
        .map_err(|e| format!("vault load: {e}"))?
        .ok_or_else(|| "no broker credentials configured".to_string())?;
    Ok(Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url,
        app_name: APP_NAME.into(),
        app_version: APP_VERSION.into(),
    })
}

#[tauri::command]
pub async fn account_list() -> Result<Vec<Account>, String> {
    let creds = load_credentials()?;
    let mut adapter = PnlPlantAdapter::new();
    adapter.connect(&creds.gateway_url).await.map_err(|e| e.to_string())?;
    adapter.login(&creds).await.map_err(|e| e.to_string())?;
    let list = adapter.fetch_account_list().await.map_err(|e| e.to_string())?;
    let _ = adapter.disconnect().await;
    Ok(list)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartLiveArgs {
    pub account_id: String,
    pub fcm: String,
    pub ib_id: String,
}

#[tauri::command]
pub async fn account_start_live(
    app: AppHandle,
    state: State<'_, AccountState>,
    args: StartLiveArgs,
) -> Result<(), String> {
    // Stop any previous feed first to ensure a clean state.
    let _ = stop_live_inner(&state).await;

    emit_feed_status(&app, FeedStatus::Connecting);

    let creds = load_credentials()?;

    // ── PnL plant ──────────────────────────────────────────────
    let mut pnl = PnlPlantAdapter::new();
    pnl.connect(&creds.gateway_url).await.map_err(|e| format!("pnl connect: {e}"))?;
    pnl.login(&creds).await.map_err(|e| format!("pnl login: {e}"))?;
    pnl.subscribe_and_run(&args.account_id, &args.fcm, &args.ib_id)
        .await
        .map_err(|e| format!("pnl subscribe: {e}"))?;

    // Spawn forwarders that read from the broadcast and emit Tauri events.
    let mut stats_rx = pnl.stats_rx();
    let mut positions_rx = pnl.positions_rx();
    let app_for_stats = app.clone();
    tokio::spawn(async move {
        while let Ok(stats) = stats_rx.recv().await {
            let _ = app_for_stats.emit("account-stats-update", stats);
        }
    });
    let app_for_pos = app.clone();
    tokio::spawn(async move {
        while let Ok(pos) = positions_rx.recv().await {
            let _ = app_for_pos.emit("account-position-update", pos);
        }
    });

    *state.pnl.lock().await = Some(pnl);

    // ── Order plant ────────────────────────────────────────────
    let mut order = OrderSubscribeAdapter::new();
    order.connect(&creds.gateway_url).await.map_err(|e| format!("order connect: {e}"))?;
    order.login(&creds).await.map_err(|e| format!("order login: {e}"))?;
    order.subscribe_and_run(&args.account_id, &args.fcm, &args.ib_id)
        .await
        .map_err(|e| format!("order subscribe: {e}"))?;

    let mut orders_rx = order.orders_rx();
    let app_for_orders = app.clone();
    tokio::spawn(async move {
        while let Ok(orders) = orders_rx.recv().await {
            let _ = app_for_orders.emit("account-orders-update", orders);
        }
    });

    *state.order.lock().await = Some(order);

    emit_feed_status(&app, FeedStatus::Connected);
    Ok(())
}

async fn stop_live_inner(state: &State<'_, AccountState>) -> Result<(), String> {
    if let Some(mut a) = state.pnl.lock().await.take() {
        let _ = a.disconnect().await;
    }
    if let Some(mut a) = state.order.lock().await.take() {
        let _ = a.disconnect().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn account_stop_live(
    app: AppHandle,
    state: State<'_, AccountState>,
) -> Result<(), String> {
    stop_live_inner(&state).await?;
    emit_feed_status(&app, FeedStatus::Disconnected);
    Ok(())
}

fn emit_feed_status(app: &AppHandle, status: FeedStatus) {
    let _ = app.emit("account-feed-status", status);
}
```

NOTE: If you need to emit `Position` updates as a full snapshot rather than per-symbol diffs, replace the position forwarder loop with one that maintains a `HashMap<String, Position>` keyed by symbol and emits the full Vec on each change (same shape as orders). MVP can ship with per-symbol diffs and let the frontend aggregate in the store.

- [ ] **Step 2: Declare module + register handlers**

Read `desktop/src-tauri/src/commands/mod.rs`, add `pub mod account;`.

Read `desktop/src-tauri/src/lib.rs`. Near the existing `commands::news::NewsState::new()` `.manage(...)` call, add:
```rust
.manage(commands::account::AccountState::new())
```

In the `tauri::generate_handler![...]` block, add (matching the trailing-comma style):
```
commands::account::account_list,
commands::account::account_start_live,
commands::account::account_stop_live,
```

- [ ] **Step 3: Compile**

```bash
cd desktop/src-tauri && cargo check
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/commands desktop/src-tauri/src/lib.rs
git commit -m "feat(account): expose tauri commands + register AccountState"
```

---

## Task 5: Frontend — types + invoke wrappers

**Files:**
- Create: `desktop/src/lib/account/api.ts`

- [ ] **Step 1: Write the file**

`desktop/src/lib/account/api.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";

export type Account = {
  id: string;
  fcm: string;
  ibId: string;
  systemName: string;
};

export type AccountStats = {
  accountId: string;
  balance: number;
  startOfDayBalance: number;
  dailyPnl: number;
  dailyLossLimit: number | null;
  trailingDrawdown: number | null;
  trailingDrawdownLimit: number | null;
  marginUsed: number | null;
};

export type PositionSide = "long" | "short" | "flat";

export type Position = {
  accountId: string;
  symbol: string;
  exchange: string;
  side: PositionSide;
  qty: number;
  avgPrice: number;
  marketPrice: number;
  unrealizedPnl: number;
  realizedPnlToday: number;
};

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "stop" | "market" | "stop_limit";

export type WorkingOrder = {
  accountId: string;
  orderId: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  orderType: OrderType;
  qty: number;
  filledQty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  status: string;
  placedAt: string;
};

export type FeedStatus = "connecting" | "connected" | "disconnected" | "error";

export async function listAccounts(): Promise<Account[]> {
  return invoke<Account[]>("account_list");
}

export async function startLive(account: { accountId: string; fcm: string; ibId: string }): Promise<void> {
  return invoke<void>("account_start_live", { args: account });
}

export async function stopLive(): Promise<void> {
  return invoke<void>("account_stop_live");
}
```

- [ ] **Step 2: Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/lib/account
git commit -m "feat(account): types + invoke wrappers"
```

---

## Task 6: Frontend — Zustand store

**Files:**
- Create: `desktop/src/lib/account/useAccountStore.ts`

- [ ] **Step 1: Write the store**

`desktop/src/lib/account/useAccountStore.ts`:
```ts
import { create } from "zustand";
import type {
  Account, AccountStats, FeedStatus, Position, WorkingOrder,
} from "./api";

export type EquityPoint = { ts: number; balance: number };

export type DayStats = {
  tradesCount: number;
  winRate: number;        // 0..1
  bestTrade: number;      // realized $
  worstTrade: number;
};

type AccountStoreState = {
  accounts: Account[];
  activeAccountId: string | null;

  stats: AccountStats | null;
  positions: Position[];                  // current open positions (qty != 0)
  workingOrders: WorkingOrder[];

  equityCurve: EquityPoint[];
  dayStats: DayStats;

  feedStatus: FeedStatus;
  error: string | null;

  setAccounts: (a: Account[]) => void;
  setActiveAccountId: (id: string | null) => void;
  setStats: (s: AccountStats) => void;
  upsertPosition: (p: Position) => void;
  setOrders: (o: WorkingOrder[]) => void;
  setFeedStatus: (s: FeedStatus) => void;
  setError: (e: string | null) => void;
  resetFeedData: () => void;
};

const EMPTY_DAY: DayStats = { tradesCount: 0, winRate: 0, bestTrade: 0, worstTrade: 0 };
const EQUITY_MIN_GAP_MS = 30_000;        // one point every 30s max
const EQUITY_CAP = 1500;                 // ~12h of session
const REALIZED_HISTORY_CAP = 500;        // closed-trade PnL keepalive

// Internal helpers — not exposed.
let realizedHistory: number[] = [];      // per-closure PnL signed

function recomputeDayStats(): DayStats {
  if (realizedHistory.length === 0) return EMPTY_DAY;
  const wins = realizedHistory.filter((x) => x > 0).length;
  return {
    tradesCount: realizedHistory.length,
    winRate: wins / realizedHistory.length,
    bestTrade: Math.max(...realizedHistory),
    worstTrade: Math.min(...realizedHistory),
  };
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  stats: null,
  positions: [],
  workingOrders: [],
  equityCurve: [],
  dayStats: EMPTY_DAY,
  feedStatus: "disconnected",
  error: null,

  setAccounts: (a) => set({ accounts: a }),
  setActiveAccountId: (id) => set({ activeAccountId: id }),

  setStats: (s) => {
    const cur = get().equityCurve;
    const now = Date.now();
    const lastTs = cur.length ? cur[cur.length - 1].ts : 0;
    let nextCurve = cur;
    if (now - lastTs >= EQUITY_MIN_GAP_MS) {
      nextCurve = [...cur, { ts: now, balance: s.balance }];
      if (nextCurve.length > EQUITY_CAP) nextCurve = nextCurve.slice(-EQUITY_CAP);
    }
    set({ stats: s, equityCurve: nextCurve });
  },

  upsertPosition: (p) => {
    const cur = get().positions;
    const prev = cur.find((x) => x.symbol === p.symbol && x.exchange === p.exchange);

    // Track realized PnL on position close (prev open → new flat).
    if (prev && prev.qty !== 0 && p.qty === 0 && p.realizedPnlToday !== prev.realizedPnlToday) {
      const delta = p.realizedPnlToday - prev.realizedPnlToday;
      realizedHistory = [...realizedHistory, delta].slice(-REALIZED_HISTORY_CAP);
      set({ dayStats: recomputeDayStats() });
    }

    const filtered = cur.filter((x) => !(x.symbol === p.symbol && x.exchange === p.exchange));
    const next = p.qty === 0 ? filtered : [...filtered, p];
    set({ positions: next });
  },

  setOrders: (o) => set({ workingOrders: o }),
  setFeedStatus: (s) => set({ feedStatus: s }),
  setError: (e) => set({ error: e }),

  resetFeedData: () => {
    realizedHistory = [];
    set({
      stats: null,
      positions: [],
      workingOrders: [],
      equityCurve: [],
      dayStats: EMPTY_DAY,
      error: null,
    });
  },
}));
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/lib/account
git commit -m "feat(account): zustand store with equity sampling + day stats"
```

---

## Task 7: Frontend — Feed lifecycle hook

**Files:**
- Create: `desktop/src/lib/account/useAccountFeed.ts`

- [ ] **Step 1: Hook**

`desktop/src/lib/account/useAccountFeed.ts`:
```ts
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listAccounts, startLive, stopLive,
  type AccountStats, type FeedStatus, type Position, type WorkingOrder,
} from "./api";
import { useAccountStore } from "./useAccountStore";

/** One-instance hook. Mount in AccountRoute only. Discovers accounts,
 *  auto-selects the first, and starts the live feed. Subscribes to all
 *  Tauri events and pipes them to the store. Cleans everything up on
 *  unmount. */
export function useAccountFeed() {
  const setAccounts = useAccountStore((s) => s.setAccounts);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);
  const setStats = useAccountStore((s) => s.setStats);
  const upsertPosition = useAccountStore((s) => s.upsertPosition);
  const setOrders = useAccountStore((s) => s.setOrders);
  const setFeedStatus = useAccountStore((s) => s.setFeedStatus);
  const setError = useAccountStore((s) => s.setError);
  const resetFeedData = useAccountStore((s) => s.resetFeedData);

  useEffect(() => {
    let cancelled = false;
    let unlistenStats: (() => void) | null = null;
    let unlistenPos:   (() => void) | null = null;
    let unlistenOrders:(() => void) | null = null;
    let unlistenStatus:(() => void) | null = null;

    const run = async () => {
      try {
        const accounts = await listAccounts();
        if (cancelled) return;
        setAccounts(accounts);
        if (accounts.length === 0) {
          setError("No accounts found on this login.");
          return;
        }
        const first = accounts[0];
        setActiveAccountId(first.id);
        resetFeedData();

        // Subscribe to events BEFORE starting the live feed so we don't
        // miss the first burst of snapshot frames.
        unlistenStats = await listen<AccountStats>(
          "account-stats-update",
          (e) => setStats(e.payload),
        );
        unlistenPos = await listen<Position>(
          "account-position-update",
          (e) => upsertPosition(e.payload),
        );
        unlistenOrders = await listen<WorkingOrder[]>(
          "account-orders-update",
          (e) => setOrders(e.payload),
        );
        unlistenStatus = await listen<FeedStatus>(
          "account-feed-status",
          (e) => setFeedStatus(e.payload),
        );

        await startLive({ accountId: first.id, fcm: first.fcm, ibId: first.ibId });
      } catch (e) {
        setError(String(e));
        setFeedStatus("error");
      }
    };
    void run();

    return () => {
      cancelled = true;
      unlistenStats?.();
      unlistenPos?.();
      unlistenOrders?.();
      unlistenStatus?.();
      void stopLive().catch(() => {});
    };
  }, [
    setAccounts, setActiveAccountId, setStats, upsertPosition,
    setOrders, setFeedStatus, setError, resetFeedData,
  ]);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/lib/account
git commit -m "feat(account): feed lifecycle hook (listen + start/stop)"
```

---

## Task 8: Frontend — AccountHeader + DayStats

**Files:**
- Create: `desktop/src/components/account/AccountHeader.tsx`
- Create: `desktop/src/components/account/DayStats.tsx`
- Create: `desktop/src/components/account/account.css`

- [ ] **Step 1: Base CSS**

`desktop/src/components/account/account.css`:
```css
/* Logo-derived green scoped to Account module — mirrors the
   News module pattern (#22c55e dominant tone). */
.account-route {
  --brand-green: #22c55e;
  --brand-green-dim: #166534;

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.account-route::-webkit-scrollbar { width: 8px; }
.account-route::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.account-header-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.account-header-title::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-green);
  margin-right: 10px;
  vertical-align: middle;
  box-shadow: 0 0 8px var(--brand-green);
}
.account-header-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.account-header-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}
.account-header-status-connected .account-header-status-dot { background: var(--brand-green); box-shadow: 0 0 6px var(--brand-green); }
.account-header-status-error     .account-header-status-dot { background: var(--accent-red); }

.account-picker {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.day-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.day-stat-chip {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.day-stat-chip-label {
  color: var(--text-muted);
  margin-right: 6px;
}
.day-stat-pos { color: var(--brand-green); }
.day-stat-neg { color: var(--accent-red); }
```

- [ ] **Step 2: AccountHeader**

`desktop/src/components/account/AccountHeader.tsx`:
```tsx
import { useAccountStore } from "../../lib/account/useAccountStore";

export function AccountHeader() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeId = useAccountStore((s) => s.activeAccountId);
  const feedStatus = useAccountStore((s) => s.feedStatus);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);

  const statusLabel = feedStatus.toUpperCase();
  const statusClass =
    feedStatus === "connected" ? "account-header-status-connected" :
    feedStatus === "error" ? "account-header-status-error" : "";

  return (
    <div className="account-header">
      <span className="account-header-title">Account</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {accounts.length > 1 && (
          <select
            className="account-picker"
            value={activeId ?? ""}
            onChange={(e) => setActiveAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.systemName || a.id} · {a.id}
              </option>
            ))}
          </select>
        )}
        {accounts.length === 1 && (
          <span className="account-picker">
            {accounts[0].systemName || accounts[0].id} · {accounts[0].id}
          </span>
        )}
        <span className={`account-header-status ${statusClass}`}>
          <span className="account-header-status-dot" />
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: DayStats**

`desktop/src/components/account/DayStats.tsx`:
```tsx
import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function DayStats() {
  const stats = useAccountStore((s) => s.dayStats);
  const wrPct = (stats.winRate * 100).toFixed(0);
  return (
    <div className="day-stats">
      <span className="day-stat-chip">
        <span className="day-stat-chip-label">Trades</span>{stats.tradesCount}
      </span>
      <span className="day-stat-chip">
        <span className="day-stat-chip-label">WR</span>{wrPct}%
      </span>
      <span className={`day-stat-chip ${stats.bestTrade >= 0 ? "day-stat-pos" : ""}`}>
        <span className="day-stat-chip-label">Best</span>{fmtMoney(stats.bestTrade)}
      </span>
      <span className={`day-stat-chip ${stats.worstTrade < 0 ? "day-stat-neg" : ""}`}>
        <span className="day-stat-chip-label">Worst</span>{fmtMoney(stats.worstTrade)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/components/account
git commit -m "feat(account): AccountHeader + DayStats components"
```

---

## Task 9: Frontend — AccountKpis (3 KPI cards)

**Files:**
- Create: `desktop/src/components/account/AccountKpis.tsx`
- Modify: `desktop/src/components/account/account.css` (append)

- [ ] **Step 1: Append CSS**

Append to `desktop/src/components/account/account.css`:
```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.kpi-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.kpi-card-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.kpi-card-value {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}
.kpi-card-value-pos { color: var(--brand-green); }
.kpi-card-value-neg { color: var(--accent-red); }
.kpi-card-sub {
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.kpi-progress {
  height: 6px;
  background: var(--bg-axis);
  border-radius: 3px;
  overflow: hidden;
}
.kpi-progress-bar {
  height: 100%;
  transition: width 0.3s ease;
}
.kpi-progress-bar-safe   { background: var(--brand-green); }
.kpi-progress-bar-warn   { background: #f5a623; }
.kpi-progress-bar-danger { background: var(--accent-red); }
```

- [ ] **Step 2: AccountKpis**

`desktop/src/components/account/AccountKpis.tsx`:
```tsx
import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "kpi-progress-bar-danger";
  if (pct >= 60) return "kpi-progress-bar-warn";
  return "kpi-progress-bar-safe";
}

export function AccountKpis() {
  const stats = useAccountStore((s) => s.stats);

  // Daily PnL : show progress toward loss limit (if defined).
  const dailyLoss = stats?.dailyPnl ?? 0;
  const dailyLimit = stats?.dailyLossLimit ?? null; // negative
  const dailyPctOfLimit =
    dailyLimit !== null && dailyLimit < 0 && dailyLoss < 0
      ? Math.min(100, (Math.abs(dailyLoss) / Math.abs(dailyLimit)) * 100)
      : 0;

  // Trailing drawdown remaining = balance - trailingDrawdown.
  const balance = stats?.balance ?? 0;
  const trailing = stats?.trailingDrawdown ?? null;
  const trailingLimit = stats?.trailingDrawdownLimit ?? null;
  const trailingRemaining = trailing !== null ? balance - trailing : null;
  const trailingPctUsed =
    trailingLimit !== null && trailingRemaining !== null && trailingLimit > 0
      ? Math.min(100, Math.max(0, (1 - trailingRemaining / trailingLimit) * 100))
      : 0;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-card-label">Account Balance</div>
        <div className="kpi-card-value">
          {stats ? `$${stats.balance.toFixed(2)}` : "—"}
        </div>
        <div className="kpi-card-sub">
          Start of day: {stats ? `$${stats.startOfDayBalance.toFixed(2)}` : "—"}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Daily PnL</div>
        <div className={`kpi-card-value ${dailyLoss >= 0 ? "kpi-card-value-pos" : "kpi-card-value-neg"}`}>
          {stats ? fmtMoney(stats.dailyPnl) : "—"}
        </div>
        {dailyLimit !== null && (
          <>
            <div className="kpi-card-sub">
              Daily limit {fmtMoney(dailyLimit)} · {dailyPctOfLimit.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(dailyPctOfLimit)}`}
                style={{ width: `${dailyPctOfLimit}%` }}
              />
            </div>
          </>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Trailing DD Remaining</div>
        <div className="kpi-card-value">
          {trailingRemaining !== null ? `$${trailingRemaining.toFixed(2)}` : "—"}
        </div>
        {trailingLimit !== null && (
          <>
            <div className="kpi-card-sub">
              Limit ${trailingLimit.toFixed(0)} · {trailingPctUsed.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(trailingPctUsed)}`}
                style={{ width: `${trailingPctUsed}%` }}
              />
            </div>
          </>
        )}
      </div>
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
git add desktop/src/components/account
git commit -m "feat(account): 3 KPI cards with progress bars"
```

---

## Task 10: Frontend — PositionsTable + WorkingOrdersTable

**Files:**
- Create: `desktop/src/components/account/PositionsTable.tsx`
- Create: `desktop/src/components/account/WorkingOrdersTable.tsx`
- Modify: `desktop/src/components/account/account.css` (append)

- [ ] **Step 1: Append CSS**

Append to `desktop/src/components/account/account.css`:
```css
.account-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
@media (max-width: 1000px) {
  .account-split { grid-template-columns: 1fr; }
}
.acct-table-wrap {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 200px;
}
.acct-table-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.acct-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  color: var(--text-primary);
}
.acct-table thead th {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.acct-table tbody td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
}
.acct-table tbody tr:last-child td { border-bottom: none; }
.acct-table-pos-num { color: var(--brand-green); }
.acct-table-neg-num { color: var(--accent-red); }
.acct-table-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 18px;
  letter-spacing: 0.04em;
}
.acct-side-buy  { color: var(--brand-green); font-weight: 700; }
.acct-side-sell { color: var(--accent-red);  font-weight: 700; }
```

- [ ] **Step 2: PositionsTable**

`desktop/src/components/account/PositionsTable.tsx`:
```tsx
import { useAccountStore } from "../../lib/account/useAccountStore";

function pnlClass(n: number): string {
  if (n > 0) return "acct-table-pos-num";
  if (n < 0) return "acct-table-neg-num";
  return "";
}

export function PositionsTable() {
  const positions = useAccountStore((s) => s.positions);

  return (
    <div className="acct-table-wrap">
      <div className="acct-table-title">Open Positions</div>
      {positions.length === 0 ? (
        <div className="acct-table-empty">No open positions.</div>
      ) : (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Avg</th>
              <th>Last</th>
              <th>uPnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={`${p.symbol}.${p.exchange}`}>
                <td>{p.symbol}</td>
                <td className={p.side === "long" ? "acct-side-buy" : p.side === "short" ? "acct-side-sell" : ""}>
                  {p.side.toUpperCase()}
                </td>
                <td>{p.qty}</td>
                <td>{p.avgPrice.toFixed(2)}</td>
                <td>{p.marketPrice.toFixed(2)}</td>
                <td className={pnlClass(p.unrealizedPnl)}>
                  {p.unrealizedPnl >= 0 ? "+" : "-"}${Math.abs(p.unrealizedPnl).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: WorkingOrdersTable**

`desktop/src/components/account/WorkingOrdersTable.tsx`:
```tsx
import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtPrice(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "—" : n.toFixed(2);
}

export function WorkingOrdersTable() {
  const orders = useAccountStore((s) => s.workingOrders);

  return (
    <div className="acct-table-wrap">
      <div className="acct-table-title">Working Orders</div>
      {orders.length === 0 ? (
        <div className="acct-table-empty">No working orders.</div>
      ) : (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Limit</th>
              <th>Stop</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.orderId}>
                <td>{o.symbol}</td>
                <td className={o.side === "buy" ? "acct-side-buy" : "acct-side-sell"}>
                  {o.side.toUpperCase()}
                </td>
                <td>{o.orderType.replace("_", " ").toUpperCase()}</td>
                <td>{o.qty}{o.filledQty > 0 && ` (${o.filledQty})`}</td>
                <td>{fmtPrice(o.limitPrice)}</td>
                <td>{fmtPrice(o.stopPrice)}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

```bash
git add desktop/src/components/account
git commit -m "feat(account): positions table + working orders table"
```

---

## Task 11: Frontend — EquityCurve canvas

**Files:**
- Create: `desktop/src/components/account/EquityCurve.tsx`
- Modify: `desktop/src/components/account/account.css` (append)

- [ ] **Step 1: Append CSS**

Append to `desktop/src/components/account/account.css`:
```css
.equity-wrap {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.equity-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.equity-canvas {
  width: 100%;
  height: 160px;
  display: block;
}
.equity-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 24px;
}
```

- [ ] **Step 2: EquityCurve component**

`desktop/src/components/account/EquityCurve.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { useAccountStore } from "../../lib/account/useAccountStore";

export function EquityCurve() {
  const points = useAccountStore((s) => s.equityCurve);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas pixel size to its CSS size, accounting for DPR.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cssW, cssH);

    const xs = points.map((p) => p.ts);
    const ys = points.map((p) => p.balance);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = Math.max(1, xMax - xMin);
    const yRange = Math.max(1, yMax - yMin);
    const padX = 8, padY = 12;
    const w = cssW - 2 * padX;
    const h = cssH - 2 * padY;

    // Line
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padX + ((p.ts - xMin) / xRange) * w;
      const y = padY + (1 - (p.balance - yMin) / yRange) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under line — subtle gradient.
    const grad = ctx.createLinearGradient(0, padY, 0, padY + h);
    grad.addColorStop(0, "rgba(34, 197, 94, 0.25)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = grad;
    ctx.lineTo(padX + w, padY + h);
    ctx.lineTo(padX, padY + h);
    ctx.closePath();
    ctx.fill();
  }, [points]);

  return (
    <div className="equity-wrap">
      <div className="equity-title">Equity Curve (session)</div>
      {points.length < 2 ? (
        <div className="equity-empty">Collecting data… need 2+ samples (~60s).</div>
      ) : (
        <canvas ref={canvasRef} className="equity-canvas" />
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
git add desktop/src/components/account
git commit -m "feat(account): equity curve canvas mini-chart"
```

---

## Task 12: Frontend — AccountRoute layout

**Files:**
- Modify: `desktop/src/routes/AccountRoute.tsx` (full rewrite)
- Modify: `desktop/src/components/account/account.css` (append final layout styles)

- [ ] **Step 1: Append layout styles**

Append to `desktop/src/components/account/account.css`:
```css
.account-bottom {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 14px;
}
@media (max-width: 1000px) {
  .account-bottom { grid-template-columns: 1fr; }
}
.account-error-banner {
  background: var(--bg-surface);
  border: 1px solid var(--accent-red);
  color: var(--accent-red);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 12px;
}
.account-empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
}
.account-empty-state-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}
```

- [ ] **Step 2: Rewrite AccountRoute**

`desktop/src/routes/AccountRoute.tsx`:
```tsx
import { useAccountStore } from "../lib/account/useAccountStore";
import { useAccountFeed } from "../lib/account/useAccountFeed";
import { AccountHeader } from "../components/account/AccountHeader";
import { AccountKpis } from "../components/account/AccountKpis";
import { PositionsTable } from "../components/account/PositionsTable";
import { WorkingOrdersTable } from "../components/account/WorkingOrdersTable";
import { EquityCurve } from "../components/account/EquityCurve";
import { DayStats } from "../components/account/DayStats";
import "../components/account/account.css";

export function AccountRoute() {
  useAccountFeed();
  const error = useAccountStore((s) => s.error);
  const accounts = useAccountStore((s) => s.accounts);
  const feedStatus = useAccountStore((s) => s.feedStatus);

  // First-mount loading state.
  if (feedStatus === "disconnected" && accounts.length === 0 && !error) {
    return (
      <div className="account-route">
        <div className="account-empty-state">
          <div className="account-empty-state-title">Connecting to Rithmic…</div>
          <div>Fetching your accounts and starting live feed.</div>
        </div>
      </div>
    );
  }

  // No accounts at all.
  if (accounts.length === 0 && error) {
    return (
      <div className="account-route">
        <div className="account-empty-state">
          <div className="account-empty-state-title">No accounts available</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-route">
      <AccountHeader />
      {error && <div className="account-error-banner">{error}</div>}
      <AccountKpis />
      <div className="account-split">
        <PositionsTable />
        <WorkingOrdersTable />
      </div>
      <div className="account-bottom">
        <EquityCurve />
        <DayStats />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd desktop && npx tsc --noEmit
```
Expected: EXIT=0.

- [ ] **Step 4: Manual smoke test**

```bash
cd desktop && npm run tauri dev
```

Procedure (with broker creds configured for an account that has at least one fill today):
1. Navigate to `/account`.
2. Verify the header status flips `connecting → connected`.
3. Verify the 3 KPI cards show non-zero values (balance, daily PnL).
4. Open a tiny paper position on MNQ (or whatever). Within ~2s the Positions table shows the new row with live uPnL ticking.
5. Place a limit order far from the market. Within ~1s the Working Orders table shows it.
6. Cancel the order externally (e.g. via your brokerage). The row disappears.
7. Wait ~60s and check the Equity Curve canvas starts drawing.
8. Close the position. Day Stats `Trades` increments by 1.
9. Navigate away from `/account`. Stop log message `"account-feed: stop"` should appear in the Tauri console.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/routes/AccountRoute.tsx desktop/src/components/account/account.css
git commit -m "feat(account): wire AccountRoute layout + lifecycle"
```

---

## Self-Review

**Spec coverage:**
- 3 KPIs (Balance / Daily PnL / Trailing DD) → Task 9 ✓
- Open positions live → Task 10 (PositionsTable), Task 2 (decode_instrument_update) ✓
- Working orders → Task 10 (WorkingOrdersTable), Task 3 (order subscribe) ✓
- Equity curve → Task 11 + Task 6 (sampling logic in store) ✓
- Day stats → Task 8 (DayStats) + Task 6 (recomputeDayStats logic) ✓
- Account picker → Task 8 (AccountHeader) ✓
- Feed status indicator → Task 8 (AccountHeader) + Task 4 (emit_feed_status) ✓
- Tauri commands (list / start / stop) → Task 4 ✓
- PnL plant adapter → Task 2 ✓
- Order subscribe adapter → Task 3 ✓
- Empty state (no broker creds / no accounts) → Task 12 ✓
- Error banner → Task 12 ✓
- Responsive < 1000px → Task 10 + Task 12 ✓
- Logo green scoped → Task 8 (account.css `:root` override on `.account-route`) ✓

**Placeholder scan:**
- "NOTE: As in Task 2, the exact field names ... may differ" — these are explicit checkpoints with the action ("grep proto/mod.rs and adapt"), not vague placeholders.
- "Position updates as full snapshot vs diffs" note in Task 4 — chose diffs (simpler) explicitly, store aggregates. Clear.
- "SSboe parsing left for the unit test" in Task 3 — the field is set to empty string; the frontend tolerates empty `placedAt`. Acceptable for MVP.

**Type consistency:**
- `AccountStats` fields match Rust → TS (balance, dailyPnl, dailyLossLimit, trailingDrawdown, trailingDrawdownLimit, marginUsed, startOfDayBalance).
- `Position` side enum: Rust `lowercase` (Long/Short/Flat → "long"/"short"/"flat") ↔ TS `"long"|"short"|"flat"` ✓.
- `WorkingOrder` orderType: Rust `snake_case` (StopLimit → "stop_limit") ↔ TS `"limit"|"stop"|"market"|"stop_limit"` ✓.
- Commands names: `account_list`, `account_start_live`, `account_stop_live` consistent between Task 4 (Rust) and Task 5 (TS wrappers).
- Events: `account-stats-update`, `account-position-update`, `account-orders-update`, `account-feed-status` — consistent between Task 4 (emit) and Task 7 (listen).
