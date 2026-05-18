//! Long-lived PnL plant adapter. Mirrors `RithmicAdapter` (Ticker
//! Plant) — own WebSocket socket, own login, own reader task. Streams
//! account-level + instrument-level PnL updates to subscribers via
//! `tokio::sync::broadcast` channels.
//!
//! Lifecycle:
//!   1. `new()` — allocate broadcast channels (no I/O).
//!   2. `connect(gateway_url)` — open the WebSocket.
//!   3. `login(creds)` — RequestLogin with `infra_type = PnlPlant`.
//!   4. `fetch_account_list()` — RequestAccountList, drain until the
//!      terminator frame (rp_code populated + no `account_id`).
//!   5. `subscribe_and_run(account_id, fcm, ib)` — RequestPnLPositionUpdates
//!      (Subscribe), split the socket, spawn the reader task. From that
//!      point on, `AccountPnLPositionUpdate` (451) and
//!      `InstrumentPnLPositionUpdate` (450) frames flow into the
//!      broadcast channels.
//!   6. `disconnect()` — RequestLogout best-effort, close socket, await
//!      the reader task with a bounded timeout.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use prost::Message as ProstMessage;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::adapter::Credentials;
use crate::connectors::error::{ConnectorError, Result};
use crate::connectors::rithmic::account_types::{Account, AccountStats, Position, PositionSide};
use crate::connectors::rithmic::client::{RithmicClient, TemplateProbe};
use crate::connectors::rithmic::proto::{
    request_login::SysInfraType, request_pn_l_position_updates::Request as PnlRequest,
    AccountPnLPositionUpdate, InstrumentPnLPositionUpdate, RequestAccountList, RequestLogin,
    RequestLogout, RequestPnLPositionUpdates, ResponseAccountList, ResponseLogin,
};

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
    pub const REQUEST_PNL_POSITION_UPDATES: i32 = 400;
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

    /// Receiver for live `AccountPnLPositionUpdate`-derived stats. Each
    /// subscriber gets its own lagging-tolerant receiver.
    pub fn stats_rx(&self) -> broadcast::Receiver<AccountStats> {
        self.stats_tx.subscribe()
    }

    /// Receiver for live `InstrumentPnLPositionUpdate`-derived positions.
    pub fn positions_rx(&self) -> broadcast::Receiver<Position> {
        self.positions_tx.subscribe()
    }

    /// Open the WebSocket. Use the same UAT / prod gateway URL as the
    /// Ticker Plant — PnL Plant shares the host, only `infra_type` at
    /// login differs.
    pub async fn connect(&mut self, gateway_url: &str) -> Result<()> {
        self.client.connect(gateway_url).await
    }

    /// Authenticate against PnL Plant. Must be called after `connect()`
    /// and before any account / subscribe call.
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
    /// (one frame per account + a terminator frame) drains.
    ///
    /// Apex behavior: the gateway sends one `ResponseAccountList` frame
    /// per account (`account_id` populated, `rp_code` empty), then a
    /// final frame with `rp_code` populated (typically `"0"`) and no
    /// `account_id`. We stop on that terminator.
    pub async fn fetch_account_list(&mut self) -> Result<Vec<Account>> {
        let req = RequestAccountList {
            template_id: template::REQUEST_ACCOUNT_LIST,
            user_msg: vec!["pnl-plant".into()],
            fcm_id: None,
            ib_id: None,
            // Rithmic requires user_type = TRADER (3) — without it the
            // response comes back empty (silent rejection). Same value
            // order_plant.rs uses for the journal-sync account list.
            user_type: Some(3),
        };
        self.client.send(&req).await?;

        let mut accounts: Vec<Account> = Vec::new();
        loop {
            let raw = self.client.recv_raw().await?;
            let probe = TemplateProbe::decode(raw.as_slice())?;
            if probe.template_id != template::RESPONSE_ACCOUNT_LIST {
                tracing::debug!(
                    "pnl-plant: skipping unexpected frame {} during account list",
                    probe.template_id
                );
                continue;
            }
            let frame = ResponseAccountList::decode(raw.as_slice())?;
            if let Some(account_id) = frame.account_id.clone() {
                accounts.push(Account {
                    id: account_id,
                    fcm: frame.fcm_id.clone().unwrap_or_default(),
                    ib_id: frame.ib_id.clone().unwrap_or_default(),
                    system_name: frame.account_name.clone().unwrap_or_default(),
                });
            }
            // Terminator: rp_code populated AND no account_id on the
            // same frame. The per-account frames have rp_code empty.
            if !frame.rp_code.is_empty() && frame.account_id.is_none() {
                break;
            }
        }
        tracing::info!("pnl-plant: account list -> {} account(s)", accounts.len());
        Ok(accounts)
    }

    /// Subscribe to live PnL updates for the given account, then split
    /// the socket and spawn the reader task. `AccountPnLPositionUpdate`
    /// and `InstrumentPnLPositionUpdate` frames are decoded inside the
    /// task and pushed to subscribers via the broadcast channels.
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
        let req = RequestPnLPositionUpdates {
            template_id: template::REQUEST_PNL_POSITION_UPDATES,
            user_msg: vec!["pnl-plant".into()],
            request: Some(PnlRequest::Subscribe as i32),
            fcm_id: Some(fcm.to_string()),
            ib_id: Some(ib.to_string()),
            account_id: Some(account_id.to_string()),
            rms_updates_only: None,
        };
        self.client.send(&req).await?;
        tracing::info!(
            "pnl-plant: subscribe sent for account={} fcm={} ib={}",
            account_id,
            fcm,
            ib
        );

        let (stream, sink) = self.client.into_split()?;
        let stats_tx = self.stats_tx.clone();
        let positions_tx = self.positions_tx.clone();
        let account_id_owned = account_id.to_string();

        let handle = tokio::spawn(async move {
            let mut stream = stream;
            tracing::info!("pnl-plant reader: started");
            loop {
                let next = stream.next().await;
                match next {
                    Some(Ok(Message::Binary(data))) => {
                        let probe = match TemplateProbe::decode(data.as_slice()) {
                            Ok(p) => p,
                            Err(e) => {
                                tracing::warn!("pnl-plant reader: probe decode: {}", e);
                                continue;
                            }
                        };
                        match probe.template_id {
                            template::ACCOUNT_PNL_POSITION_UPDATE => {
                                match decode_account_update(&data, &account_id_owned) {
                                    Ok(stats) => {
                                        let _ = stats_tx.send(stats);
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "pnl-plant reader: account update decode: {}",
                                            e
                                        );
                                    }
                                }
                            }
                            template::INSTRUMENT_PNL_POSITION_UPDATE => {
                                match decode_instrument_update(&data, &account_id_owned) {
                                    Ok(pos) => {
                                        let _ = positions_tx.send(pos);
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "pnl-plant reader: instrument update decode: {}",
                                            e
                                        );
                                    }
                                }
                            }
                            other => {
                                tracing::trace!(
                                    "pnl-plant reader: ignoring frame template {}",
                                    other
                                );
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        // Pong through the shared sink so the server
                        // doesn't drop us for being unresponsive.
                        let mut s = sink.lock().await;
                        if let Err(e) = s.send(Message::Pong(payload)).await {
                            tracing::warn!("pnl-plant reader: pong send failed: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!("pnl-plant reader: server closed ({:?})", frame);
                        break;
                    }
                    Some(Ok(_)) => { /* Text / Pong / Frame: skip */ }
                    Some(Err(e)) => {
                        tracing::warn!("pnl-plant reader: ws error: {}", e);
                        break;
                    }
                    None => {
                        tracing::info!("pnl-plant reader: stream ended");
                        break;
                    }
                }
            }
            tracing::info!("pnl-plant reader: exiting");
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
            tracing::warn!("pnl-plant: logout send failed: {}", e);
        }
        if let Err(e) = self.client.close().await {
            tracing::warn!("pnl-plant: socket close failed: {}", e);
        }
        if let Some(handle) = self.reader_handle.take() {
            match tokio::time::timeout(READER_SHUTDOWN_TIMEOUT, handle).await {
                Ok(Ok(())) => tracing::info!("pnl-plant: reader ended cleanly"),
                Ok(Err(e)) => tracing::warn!("pnl-plant: reader join error: {}", e),
                Err(_) => tracing::warn!(
                    "pnl-plant: reader did not exit within {:?}",
                    READER_SHUTDOWN_TIMEOUT
                ),
            }
        }
        Ok(())
    }
}

impl Default for PnlPlantAdapter {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse a Rithmic-wire string-encoded currency amount. Empty / missing
/// fields decode to 0.0. Bad strings log at debug and yield 0.0 too —
/// we never want a single malformed frame to nuke the live stream.
fn parse_amount(opt: &Option<String>) -> f64 {
    match opt {
        None => 0.0,
        Some(s) if s.is_empty() => 0.0,
        Some(s) => match s.parse::<f64>() {
            Ok(v) => v,
            Err(_) => {
                tracing::debug!("pnl-plant: unparseable amount '{}'", s);
                0.0
            }
        },
    }
}

fn parse_amount_opt(opt: &Option<String>) -> Option<f64> {
    match opt {
        None => None,
        Some(s) if s.is_empty() => None,
        Some(s) => s.parse::<f64>().ok(),
    }
}

fn decode_account_update(raw: &[u8], account_id_default: &str) -> Result<AccountStats> {
    let f = AccountPnLPositionUpdate::decode(raw)?;
    // Note: the Rithmic proto does NOT carry `start_of_day_balance` on
    // AccountPnLPositionUpdate. We surface 0.0 here; the UI layer can
    // reconstruct SOD from the daily delta (balance - day_pnl).
    Ok(AccountStats {
        account_id: f.account_id.unwrap_or_else(|| account_id_default.to_string()),
        balance: parse_amount(&f.account_balance),
        start_of_day_balance: 0.0,
        daily_pnl: parse_amount(&f.day_pnl),
        // `loss_limit` is published on ResponseAccountList, not on this
        // frame — Apex's trailing rules live on the RMS plant. Leave
        // None and let the UI layer merge in the RMS values.
        daily_loss_limit: None,
        // `min_account_balance` = peak-low of equity in the current
        // session, useful as a trailing-drawdown floor proxy.
        trailing_drawdown: parse_amount_opt(&f.min_account_balance),
        // `min_margin_balance` = the equivalent on margin terms.
        trailing_drawdown_limit: parse_amount_opt(&f.min_margin_balance),
        margin_used: parse_amount_opt(&f.margin_balance),
    })
}

fn decode_instrument_update(raw: &[u8], account_id_default: &str) -> Result<Position> {
    let f = InstrumentPnLPositionUpdate::decode(raw)?;
    // `net_quantity` is signed: positive long, negative short, zero flat.
    // It's the only directional quantity on this frame — `fill_buy_qty`
    // / `fill_sell_qty` are cumulative session totals, not the current
    // position.
    let net = f.net_quantity.unwrap_or(0);
    let (side, qty_abs) = if net > 0 {
        (PositionSide::Long, net as f64)
    } else if net < 0 {
        (PositionSide::Short, (-net) as f64)
    } else {
        (PositionSide::Flat, 0.0)
    };
    // No `market_value` / `market_price` field on this frame — we leave
    // 0.0 and let the UI cross-reference the live last-trade feed.
    Ok(Position {
        account_id: f
            .account_id
            .unwrap_or_else(|| account_id_default.to_string()),
        symbol: f.symbol.unwrap_or_default(),
        exchange: f.exchange.unwrap_or_default(),
        side,
        qty: qty_abs,
        avg_price: f.avg_open_fill_price.unwrap_or(0.0),
        market_price: 0.0,
        unrealized_pnl: parse_amount(&f.open_position_pnl),
        realized_pnl_today: parse_amount(&f.closed_position_pnl),
    })
}
