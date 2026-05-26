//! Rithmic Order Plant — one-shot history pull.
//!
//! This module is intentionally separate from `RithmicAdapter` because:
//!   * Order Plant uses a different `infra_type` at login (`OrderPlant`)
//!     and the gateway will refuse two infra_types on the same socket.
//!   * Our journal sync is a one-shot pull (open → login → fetch →
//!     close), not a long-lived subscription. No reader task, no
//!     heartbeat — keeps the surface tiny and predictable.
//!
//! Flow:
//!   1. open WebSocket
//!   2. RequestLogin (infra_type = OrderPlant)
//!   3. RequestAccountList → collect (fcm_id, ib_id, account_id) per row
//!   4. for each account: RequestShowOrderHistoryDates (returns the days
//!      that have any order activity), then RequestShowOrderHistoryDetail
//!      per day → ExchangeOrderNotification frames stream back.
//!   5. Drain frames until ResponseShowOrderHistoryDetail terminator,
//!      collect every `notify_type=Fill` (status=filled, fill_price,
//!      fill_size populated).
//!   6. RequestLogout, close socket, return raw fills.
//!
//! Trade reconstruction (FIFO position state-machine that converts
//! fills → round-trip Trade rows) lives in `journal::rithmic_sync`.

use std::time::Duration;

use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, ExchangeOrderNotification, RequestAccountList, RequestLogin,
    RequestLogout, RequestSubscribeForOrderUpdates, ResponseAccountList, ResponseLogin,
};
use prost::Message as ProstMessage;

/// Wire-protocol revision string Rithmic expects in RequestLogin.
const PROTOCOL_TEMPLATE_VERSION: &str = "3.9";

/// How long we wait for a single response burst (account list, history
/// dates, history detail) before giving up. The gateway answers within
/// a few hundred ms in practice; 8s is just a safety net so a hung
/// connection doesn't block the journal sync forever.
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(8);

/// Standard Rithmic R|API templates we exchange. The `RequestLogin` /
/// `ResponseLogin` IDs are shared with the Ticker Plant flow (10 / 11).
mod template {
    pub const REQUEST_LOGIN: i32 = 10;
    pub const RESPONSE_LOGIN: i32 = 11;
    pub const REQUEST_LOGOUT: i32 = 12;

    // Order Plant — account discovery + order history. Template numbers
    // match the published Rithmic R|API reference guide.
    pub const REQUEST_ACCOUNT_LIST: i32 = 302;
    pub const RESPONSE_ACCOUNT_LIST: i32 = 303;

    pub const REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES: i32 = 308;
    pub const RESPONSE_SUBSCRIBE_FOR_ORDER_UPDATES: i32 = 309;

    pub const EXCHANGE_ORDER_NOTIFICATION: i32 = 351;
    pub const RITHMIC_ORDER_NOTIFICATION: i32 = 352;
}

/// How long we drain the PnL stream after subscribing. The snapshot
/// burst usually arrives within 1-2 seconds; we stay an extra second
/// in case the gateway is staggering frames.
const SNAPSHOT_DRAIN: Duration = Duration::from_secs(5);

/// Connection credentials. Mirrors the Ticker Plant `Credentials`
/// struct but kept separate so the user can have different scope per
/// plant if needed (in practice Apex uses one set for both).
#[derive(Debug, Clone)]
pub struct OrderPlantCredentials {
    pub username: String,
    pub password: String,
    pub system_name: String,
    pub gateway_url: String,
    pub app_name: String,
    pub app_version: String,
}

/// One row from `ResponseAccountList`. We only keep the fields needed
/// to build subsequent requests + display in the UI.
#[derive(Debug, Clone)]
pub struct OrderPlantAccount {
    pub fcm_id: String,
    pub ib_id: String,
    pub account_id: String,
    pub account_name: String,
    pub account_currency: Option<String>,
}

/// A single fill event extracted from `ExchangeOrderNotification`.
/// `notify_type=Fill` (enum value 5) + `status` populated. This is the
/// raw input to the FIFO trade reconstructor.
#[derive(Debug, Clone)]
pub struct RithmicFill {
    pub account_id: String,
    pub symbol: String,
    pub exchange: String,
    /// Buy = 1, Sell = 2 (from `transaction_type`).
    pub is_buy: bool,
    pub fill_price: f64,
    pub fill_size: i32,
    /// "YYYY-MM-DD HH:MM:SS" UTC as Rithmic ships it. Not yet
    /// normalized to ISO 8601 — caller does that.
    pub fill_time: String,
    pub fill_date: String,
    /// Stable upstream id. Used by `upsert_trade_external` to dedupe.
    pub fill_id: String,
    /// Per-fill commission (when the gateway fills it in — Apex does).
    pub commission: Option<f64>,
}

/// Result of `pull_history()` — what the journal sync layer consumes.
pub struct OrderPlantPull {
    pub accounts: Vec<OrderPlantAccount>,
    pub fills: Vec<RithmicFill>,
}

/// Open a fresh Order Plant connection, log in, pull account list and
/// history fills, then close. Cancellation-safe: any error tears the
/// socket down and propagates.
pub async fn pull_history(creds: &OrderPlantCredentials, days: u32) -> Result<OrderPlantPull> {
    let mut client = RithmicClient::new();
    tracing::info!("order_plant: connecting to {}", creds.gateway_url);
    client.connect(&creds.gateway_url).await?;

    // ── Login (infra_type = OrderPlant) ────────────────────────────────
    let login_req = RequestLogin {
        template_id: template::REQUEST_LOGIN,
        template_version: Some(PROTOCOL_TEMPLATE_VERSION.into()),
        user_msg: vec!["orderflowv2_journal_sync".into()],
        user: Some(creds.username.clone()),
        password: Some(creds.password.clone()),
        app_name: Some(creds.app_name.clone()),
        app_version: Some(creds.app_version.clone()),
        system_name: Some(creds.system_name.clone()),
        // OrderPlant — ExchangeOrderNotification (template 351) flows
        // here. PnL Plant only carries PnL aggregates (AccountPnL +
        // InstrumentPnL) — verified empirically against Apex.
        // To get fills we subscribe via RequestSubscribeForOrderUpdates
        // (template 308) below.
        infra_type: Some(SysInfraType::OrderPlant as i32),
        mac_addr: vec![],
        os_version: None,
        os_platform: None,
        aggregated_quotes: None,
    };
    tracing::info!(
        "order_plant: sending RequestLogin (system='{}', user='{}')",
        creds.system_name,
        creds.username
    );
    client.send(&login_req).await?;

    let login_resp: ResponseLogin = client.recv().await?;
    if login_resp.template_id != template::RESPONSE_LOGIN {
        return Err(ConnectorError::UnexpectedMessage(login_resp.template_id));
    }
    let primary = login_resp.rp_code.first().cloned().unwrap_or_default();
    if primary != "0" {
        let _ = client.close().await;
        return Err(ConnectorError::AuthFailed(format!(
            "order_plant login rejected: rp_code={} detail={:?} user_msg={:?}",
            primary,
            login_resp
                .rp_code
                .iter()
                .skip(1)
                .cloned()
                .collect::<Vec<_>>(),
            login_resp.user_msg
        )));
    }
    let fcm_id = login_resp.fcm_id.clone().unwrap_or_default();
    let ib_id = login_resp.ib_id.clone().unwrap_or_default();
    tracing::info!("order_plant: login OK (fcm={} ib={})", fcm_id, ib_id);

    // ── Account list ───────────────────────────────────────────────────
    let acc_req = RequestAccountList {
        template_id: template::REQUEST_ACCOUNT_LIST,
        user_msg: vec![],
        fcm_id: Some(fcm_id.clone()),
        ib_id: Some(ib_id.clone()),
        user_type: Some(3 /* USER_TYPE_TRADER */),
    };
    client.send(&acc_req).await?;

    // Account list: server may stream multiple frames (one per account)
    // ending with rp_code="0" on a final frame. We collect until we see
    // a frame with non-empty rp_code that signals end-of-stream.
    let mut accounts: Vec<OrderPlantAccount> = Vec::new();
    loop {
        let frame = recv_with_timeout(&mut client).await?;
        let probe = TemplateProbe::decode(frame.as_slice())?;
        if probe.template_id != template::RESPONSE_ACCOUNT_LIST {
            tracing::debug!(
                "order_plant: skipping unexpected frame {}",
                probe.template_id
            );
            continue;
        }
        let resp = ResponseAccountList::decode(frame.as_slice())?;
        // Per-row payload: account_id present means it's data; rp_code
        // present + no account_id means end-of-stream.
        if let Some(account_id) = resp.account_id.clone() {
            accounts.push(OrderPlantAccount {
                fcm_id: resp.fcm_id.clone().unwrap_or_default(),
                ib_id: resp.ib_id.clone().unwrap_or_default(),
                account_id,
                account_name: resp.account_name.clone().unwrap_or_default(),
                account_currency: resp.account_currency.clone(),
            });
        }
        if !resp.rp_code.is_empty() {
            break;
        }
    }
    tracing::info!("order_plant: discovered {} account(s)", accounts.len());

    // ── PnL position updates subscribe → drain snapshot ───────────────
    // Strategy v3 (Apex-tested): the canonical Rithmic path for fills
    // is `RequestPnLPositionUpdates(Subscribe)`. The gateway answers
    // with: 1× ResponsePnLPositionUpdates ack, then a burst of
    // ExchangeOrderNotification frames with `is_snapshot=true` for
    // recent fills, AccountPnLPositionUpdate for the account
    // aggregates, and InstrumentPnLPositionUpdate for per-symbol
    // positions. After the snapshot, the stream goes quiet (live
    // fills would come later, but we don't keep the socket open for
    // those — this is a one-shot pull).
    //
    // We drain for SNAPSHOT_DRAIN seconds, collect every fill we see,
    // log the raw template_id distribution so we know what Apex
    // actually sent, then unsubscribe + logout.
    let _ = days; // PnL subscribe gives "current state" — no day filter
    let mut fills: Vec<RithmicFill> = Vec::new();

    for account in &accounts {
        tracing::info!(
            "order_plant: subscribing for order updates on {} (fcm={}, ib={})",
            account.account_id,
            account.fcm_id,
            account.ib_id
        );
        let sub = RequestSubscribeForOrderUpdates {
            template_id: template::REQUEST_SUBSCRIBE_FOR_ORDER_UPDATES,
            user_msg: vec![],
            fcm_id: Some(account.fcm_id.clone()),
            ib_id: Some(account.ib_id.clone()),
            account_id: Some(account.account_id.clone()),
        };
        client.send(&sub).await?;

        // Drain for SNAPSHOT_DRAIN seconds. We use per-recv timeout =
        // remaining-window to avoid waiting forever if the stream goes
        // quiet earlier than expected.
        let deadline = tokio::time::Instant::now() + SNAPSHOT_DRAIN;
        let mut frame_counts: std::collections::HashMap<i32, u32> =
            std::collections::HashMap::new();
        let mut acct_fills = 0usize;

        loop {
            let now = tokio::time::Instant::now();
            if now >= deadline {
                break;
            }
            let remaining = deadline - now;
            let recv = tokio::time::timeout(remaining, client.recv_raw()).await;
            let frame = match recv {
                Ok(Ok(b)) => b,
                Ok(Err(e)) => {
                    tracing::warn!("order_plant: recv error during drain: {}", e);
                    break;
                }
                Err(_) => break, // window expired
            };
            let probe = match TemplateProbe::decode(frame.as_slice()) {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!("order_plant: undecodable frame: {}", e);
                    continue;
                }
            };
            *frame_counts.entry(probe.template_id).or_insert(0) += 1;

            match probe.template_id {
                template::EXCHANGE_ORDER_NOTIFICATION => {
                    let n = ExchangeOrderNotification::decode(frame.as_slice())?;
                    tracing::info!(
                        "  ex_order: snap={:?} type={:?} status={:?} txn={:?} \
                         fill_price={:?} fill_size={:?} fill_id={:?} sym={:?} acct={:?}",
                        n.is_snapshot,
                        n.notify_type,
                        n.status,
                        n.transaction_type,
                        n.fill_price,
                        n.fill_size,
                        n.fill_id,
                        n.symbol,
                        n.account_id,
                    );
                    if let Some(fill) = fill_from_notification(&n) {
                        fills.push(fill);
                        acct_fills += 1;
                    }
                }
                template::RESPONSE_SUBSCRIBE_FOR_ORDER_UPDATES => {
                    tracing::info!("  order_updates_ack");
                }
                template::RITHMIC_ORDER_NOTIFICATION => {
                    tracing::debug!("  rithmic_order_notif (pre-exchange ack, ignored)");
                }
                other => {
                    tracing::info!("  unknown template {} during order updates drain", other);
                }
            }
        }

        // No explicit unsubscribe for RequestSubscribeForOrderUpdates;
        // the socket close at logout tears the per-account stream down.

        tracing::info!(
            "order_plant: account {} drained — {} fills, frame_counts={:?}",
            account.account_id,
            acct_fills,
            frame_counts
        );
    }
    tracing::info!("order_plant: pulled {} fill(s) total", fills.len());

    // ── Logout + close ─────────────────────────────────────────────────
    let logout = RequestLogout {
        template_id: template::REQUEST_LOGOUT,
        user_msg: vec![],
    };
    let _ = client.send(&logout).await;
    let _ = client.close().await;

    Ok(OrderPlantPull { accounts, fills })
}

/// Map an `ExchangeOrderNotification` to a `RithmicFill` if and only
/// if the frame represents an actual fill (price + size populated,
/// transaction_type known). Returns `None` for the dozens of other
/// notification kinds (cancel acks, modify acks, etc.) we don't care
/// about here.
fn fill_from_notification(n: &ExchangeOrderNotification) -> Option<RithmicFill> {
    let fill_price = n.fill_price?;
    let fill_size = n.fill_size?;
    if fill_size <= 0 {
        return None;
    }
    let txn = n.transaction_type? as i32;
    // Rithmic enum: 1 = BUY, 2 = SELL.
    let is_buy = match txn {
        1 => true,
        2 => false,
        _ => return None,
    };
    let symbol = n.symbol.clone()?;
    let exchange = n.exchange.clone().unwrap_or_default();
    let account_id = n.account_id.clone()?;
    let fill_time = n.fill_time.clone().unwrap_or_default();
    let fill_date = n.fill_date.clone().unwrap_or_default();
    let fill_id = n
        .fill_id
        .clone()
        .or_else(|| n.exchange_order_id.clone())
        .unwrap_or_default();
    if fill_id.is_empty() {
        return None;
    }
    Some(RithmicFill {
        account_id,
        symbol,
        exchange,
        is_buy,
        fill_price,
        fill_size,
        fill_time,
        fill_date,
        fill_id,
        commission: None, // Apex commission ships via a separate frame
                          // (AccountPnLPositionUpdate). We can wire it
                          // in once the round-trip flow is verified.
    })
}

async fn recv_with_timeout(client: &mut RithmicClient) -> Result<Vec<u8>> {
    tokio::time::timeout(RESPONSE_TIMEOUT, client.recv_raw())
        .await
        .map_err(|_| ConnectorError::Other("order_plant: response timeout".into()))?
}

/// Last `n` calendar days as "YYYYMMDD" strings, most-recent-first.
/// Self-contained UTC date math — avoids pulling chrono just for this.
fn recent_dates_yyyymmdd(n: u32) -> Vec<String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let mut out = Vec::with_capacity(n as usize);
    for i in 0..n {
        let s = secs - (i as i64 * 86_400);
        let (y, mo, d) = unix_to_ymd(s);
        out.push(format!("{:04}{:02}{:02}", y, mo, d));
    }
    out
}

fn unix_to_ymd(secs: i64) -> (i32, u32, u32) {
    // Days since 1970-01-01.
    let mut z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let _ = &mut z; // silence unused-mut from rustc on some versions
    (y, m, d)
}
