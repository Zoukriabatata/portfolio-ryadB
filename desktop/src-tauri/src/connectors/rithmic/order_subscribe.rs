//! Long-lived Order plant subscription. Distinct from
//! `order_plant.rs` (one-shot journal sync) — this stays open and
//! streams every order status change for the active account so the
//! Account dashboard can show working orders in real time.
//!
//! Lifecycle mirrors `pnl_plant.rs`:
//!   1. `new()` — allocate broadcast channel (no I/O).
//!   2. `connect(gateway_url)` — open the WebSocket.
//!   3. `login(creds)` — RequestLogin with `infra_type = OrderPlant`.
//!   4. `subscribe_and_run(account_id, fcm, ib)` — RequestSubscribeForOrderUpdates,
//!      split the socket, spawn the reader task. From that point on,
//!      RithmicOrderNotification (352) frames flow into the orders map
//!      and a fresh working-orders snapshot is broadcast on every change.
//!   5. `disconnect()` — RequestLogout best-effort, close socket, await
//!      the reader task with a bounded timeout.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::account_types::{OrderSide, OrderType, WorkingOrder};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType,
    rithmic_order_notification::{PriceType as ProtoPriceType, TransactionType as ProtoTxType},
    RequestLogin, RequestLogout, RequestSubscribeForOrderUpdates, ResponseLogin,
    RithmicOrderNotification,
};

const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";
const ORDERS_CHANNEL_CAPACITY: usize = 256;
const READER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

mod template {
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;
    pub const REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES: i32 = 308;
    pub const RITHMIC_ORDER_NOTIFICATION: i32 = 352;
}

/// Status strings (lowercased) that indicate the order is still live
/// on the book. Anything else (filled / cancelled / rejected /
/// completed) removes the order from the working set.
fn is_working_status(status: &str) -> bool {
    let s = status.to_ascii_lowercase();
    matches!(
        s.as_str(),
        "working"
            | "pending"
            | "open"
            | "open pending"
            | "modify pending"
            | "trigger pending"
            | "partially_filled"
            | "partially filled"
            | "partial"
    )
}

pub struct OrderSubscribeAdapter {
    client: RithmicClient,
    /// Snapshot of every order seen (working OR done, transiently).
    /// Reader task updates this and broadcasts the working subset
    /// on each change.
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

    /// Receiver for snapshots of currently working orders. Each
    /// subscriber gets its own lagging-tolerant receiver.
    pub fn orders_rx(&self) -> broadcast::Receiver<Vec<WorkingOrder>> {
        self.orders_tx.subscribe()
    }

    /// Open the WebSocket. Same gateway URL as the Ticker / PnL plants.
    pub async fn connect(&mut self, gateway_url: &str) -> Result<()> {
        self.client.connect(gateway_url).await
    }

    /// Authenticate against Order Plant. Must be called after
    /// `connect()` and before `subscribe_and_run()`.
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

    /// Subscribe to live order updates for the given account, then
    /// split the socket and spawn the reader task. From that point on,
    /// `RithmicOrderNotification` (352) frames are decoded and the
    /// working-orders snapshot is broadcast on every change.
    ///
    /// After this call, `self.client` is in `Split` mode — `recv_raw()`
    /// is no longer valid on it. Sends (e.g. RequestLogout) still work
    /// through the shared sink.
    pub async fn subscribe_and_run(
        &mut self,
        account_id: &str,
        fcm: &str,
        ib: &str,
    ) -> Result<()> {
        let req = RequestSubscribeForOrderUpdates {
            template_id: template::REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES,
            user_msg: vec!["order-sub".into()],
            fcm_id: Some(fcm.to_string()),
            ib_id: Some(ib.to_string()),
            account_id: Some(account_id.to_string()),
        };
        self.client.send(&req).await?;
        tracing::info!(
            "order-sub: subscribe sent for account={} fcm={} ib={}",
            account_id,
            fcm,
            ib
        );

        let (stream, sink) = self.client.into_split()?;
        let orders_tx = self.orders_tx.clone();
        let orders = self.orders.clone();
        let account_id_owned = account_id.to_string();

        let handle = tokio::spawn(async move {
            let mut stream = stream;
            tracing::info!("order-sub reader: started");
            loop {
                let next = stream.next().await;
                match next {
                    Some(Ok(Message::Binary(data))) => {
                        let probe = match TemplateProbe::decode(data.as_slice()) {
                            Ok(p) => p,
                            Err(e) => {
                                tracing::warn!("order-sub reader: probe decode: {}", e);
                                continue;
                            }
                        };
                        match probe.template_id {
                            template::RITHMIC_ORDER_NOTIFICATION => {
                                match RithmicOrderNotification::decode(data.as_slice()) {
                                    Ok(frame) => {
                                        let wo = frame_to_working_order(&frame, &account_id_owned);
                                        if wo.order_id.is_empty() {
                                            tracing::trace!(
                                                "order-sub reader: skipping notification without order id"
                                            );
                                            continue;
                                        }
                                        let working = is_working_status(&wo.status);
                                        let snapshot = {
                                            let mut map = orders.lock().await;
                                            if working {
                                                map.insert(wo.order_id.clone(), wo);
                                            } else {
                                                map.remove(&wo.order_id);
                                            }
                                            map.values().cloned().collect::<Vec<WorkingOrder>>()
                                        };
                                        let _ = orders_tx.send(snapshot);
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "order-sub reader: order notification decode: {}",
                                            e
                                        );
                                    }
                                }
                            }
                            other => {
                                tracing::trace!(
                                    "order-sub reader: ignoring frame template {}",
                                    other
                                );
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("order-sub reader: pong send failed: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("order-sub reader: server closed ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => { /* Text / Pong / Frame: skip */ }
                    Some(Err(e)) => {
                        tracing::warn!("order-sub reader: ws error: {}", e);
                        break;
                    }
                    None => {
                        tracing::info!("order-sub reader: stream ended");
                        break;
                    }
                }
            }
            tracing::info!("order-sub reader: exiting");
        });
        self.reader_handle = Some(handle);
        Ok(())
    }

    /// Graceful teardown: best-effort RequestLogout, close socket,
    /// await reader task with a bounded timeout. Always tears local
    /// state down even if a step errors.
    pub async fn disconnect(&mut self) -> Result<()> {
        let logout = RequestLogout {
            template_id: template::REQUEST_LOGOUT,
            user_msg: vec![],
        };
        if let Err(e) = self.client.send(&logout).await {
            tracing::warn!("order-sub: logout send failed: {}", e);
        }
        if let Err(e) = self.client.close().await {
            tracing::warn!("order-sub: socket close failed: {}", e);
        }
        if let Some(handle) = self.reader_handle.take() {
            match tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, handle).await {
                Ok(Ok(())) => tracing::info!("order-sub: reader ended cleanly"),
                Ok(Err(e)) => tracing::warn!("order-sub: reader join error: {}", e),
                Err(_) => tracing::warn!(
                    "order-sub: reader did not exit within {:?}",
                    READER_SHUTDOWN_TIMEOUT
                ),
            }
        }
        Ok(())
    }
}

impl Default for OrderSubscribeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert a raw `RithmicOrderNotification` frame to a `WorkingOrder`.
///
/// Proto adaptations vs. the plan skeleton :
/// - `transaction_type` and `price_type` are protobuf enum i32, not
///   strings — we use the generated `try_from(i32)` to decode them.
/// - `total_fill_size` (i32) replaces the planned `filled_size`.
/// - `quantity` is i32, not u32. Cast to f64.
/// - `price` / `trigger_price` are already `Option<f64>` — no parsing
///   needed (no `parse_amount` helper required here).
/// - `placed_at` left empty for now: Rithmic exposes ssboe+usecs on
///   this frame; a higher layer can format them if the UI ever needs
///   the wall-clock placement time.
fn frame_to_working_order(
    frame: &RithmicOrderNotification,
    account_id_default: &str,
) -> WorkingOrder {
    let side = match frame.transaction_type.and_then(|v| ProtoTxType::try_from(v).ok()) {
        Some(ProtoTxType::Buy) => OrderSide::Buy,
        // SELL and SS (short sell) both map to our generic Sell.
        _ => OrderSide::Sell,
    };
    let order_type = match frame.price_type.and_then(|v| ProtoPriceType::try_from(v).ok()) {
        Some(ProtoPriceType::Limit) => OrderType::Limit,
        Some(ProtoPriceType::StopMarket) => OrderType::Stop,
        Some(ProtoPriceType::StopLimit) => OrderType::StopLimit,
        Some(ProtoPriceType::Market) => OrderType::Market,
        None => OrderType::Market,
    };
    WorkingOrder {
        account_id: frame
            .account_id
            .clone()
            .unwrap_or_else(|| account_id_default.to_string()),
        // Rithmic does not expose a separate `order_id` on this frame;
        // `basket_id` is the stable per-order identifier on Order Plant
        // notifications. Fall back to exchange_order_id if missing.
        order_id: frame
            .basket_id
            .clone()
            .or_else(|| frame.exchange_order_id.clone())
            .unwrap_or_default(),
        symbol: frame.symbol.clone().unwrap_or_default(),
        exchange: frame.exchange.clone().unwrap_or_default(),
        side,
        order_type,
        qty: frame.quantity.unwrap_or(0) as f64,
        filled_qty: frame.total_fill_size.unwrap_or(0) as f64,
        limit_price: frame.price,
        stop_price: frame.trigger_price,
        status: frame.status.clone().unwrap_or_default(),
        placed_at: String::new(),
    }
}
