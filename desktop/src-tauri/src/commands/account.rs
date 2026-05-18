//! Tauri commands for the Account dashboard. Owns the long-lived
//! PnL + Order adapters and forwards their broadcasts to the React
//! layer via `AppHandle::emit`.

use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::brokers::vault;
use crate::connectors::adapter::Credentials;
use crate::connectors::rithmic::account_types::{
    Account, FeedStatus,
};
use crate::connectors::rithmic::order_plant::{self, OrderPlantCredentials};
use crate::connectors::rithmic::order_subscribe::OrderSubscribeAdapter;
use crate::connectors::rithmic::pnl_plant::PnlPlantAdapter;
use crate::journal::rithmic_sync;

const DEFAULT_APP_NAME: &str = "OrderflowV2";
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
    fn default() -> Self {
        Self::new()
    }
}

async fn load_credentials() -> Result<Credentials, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| "no broker credentials saved".to_string())?;
    Ok(Credentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url,
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    })
}

#[tauri::command]
pub async fn account_list() -> Result<Vec<Account>, String> {
    let creds = load_credentials().await?;
    let mut adapter = PnlPlantAdapter::new();
    adapter
        .connect(&creds.gateway_url)
        .await
        .map_err(|e| format!("pnl connect: {e}"))?;
    adapter
        .login(&creds)
        .await
        .map_err(|e| format!("pnl login: {e}"))?;
    let list = adapter
        .fetch_account_list()
        .await
        .map_err(|e| format!("account list: {e}"))?;
    let _ = adapter.disconnect().await;
    tracing::info!("account_list: returned {} accounts", list.len());
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

    let creds = load_credentials().await?;

    // ── PnL plant ──────────────────────────────────────────────
    let mut pnl = PnlPlantAdapter::new();
    pnl.connect(&creds.gateway_url)
        .await
        .map_err(|e| format!("pnl connect: {e}"))?;
    pnl.login(&creds)
        .await
        .map_err(|e| format!("pnl login: {e}"))?;
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
    order
        .connect(&creds.gateway_url)
        .await
        .map_err(|e| format!("order connect: {e}"))?;
    order
        .login(&creds)
        .await
        .map_err(|e| format!("order login: {e}"))?;
    order
        .subscribe_and_run(&args.account_id, &args.fcm, &args.ib_id)
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

/// Closed-trade summary for the Day Stats panel. Returned as a Vec
/// from `account_fetch_today_trades` — frontend keeps it minimal
/// (signed PnL is all the panel needs to compute count / WR / best /
/// worst).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayTrade {
    pub symbol: String,
    pub side: String, // "LONG" | "SHORT"
    pub pnl: f64,
    pub exit_time: String,
}

/// Fetch today's CLOSED round-trip trades from Rithmic.
///
/// Reuses the journal-sync infrastructure: `order_plant::pull_history`
/// (one-shot OrderPlant pull of fills) + `rithmic_sync::reconstruct_trades`
/// (FIFO state machine that turns fills into round-trip Trade rows).
/// Filtered down to trades whose `exit_time` is at or after today's
/// UTC midnight — covers a CME trading day starting from the Sunday
/// reopen for the live trader's purposes.
#[tauri::command]
pub async fn account_fetch_today_trades() -> Result<Vec<TodayTrade>, String> {
    let stored = tokio::task::spawn_blocking(vault::load)
        .await
        .map_err(|e| format!("vault task panicked: {e}"))?
        .map_err(|e| format!("vault load failed: {e}"))?
        .ok_or_else(|| "no broker credentials saved".to_string())?;

    let op_creds = OrderPlantCredentials {
        username: stored.username,
        password: stored.password,
        system_name: stored.system_name,
        gateway_url: stored.gateway_url,
        app_name: DEFAULT_APP_NAME.into(),
        app_version: APP_VERSION.into(),
    };

    // Pull last 2 days of fills — covers today + yesterday's overnight
    // session (CME opens Sunday 17:00 CT). We'll filter to "today" below.
    let pull = order_plant::pull_history(&op_creds, 2)
        .await
        .map_err(|e| format!("rithmic pull: {e}"))?;
    tracing::info!(
        "account_fetch_today_trades: pulled {} fills across {} accounts",
        pull.fills.len(),
        pull.accounts.len(),
    );

    let trades = rithmic_sync::reconstruct_trades(&pull.accounts, &pull.fills);

    // Cut-off = today's UTC midnight as ISO. Compares string-wise on
    // ISO 8601 — safe since the format is fixed-width and lexicographic
    // order matches chronological order.
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let day_secs = now_secs - now_secs.rem_euclid(86_400);
    let cutoff_iso = format_unix_to_iso8601(day_secs);

    let today: Vec<TodayTrade> = trades
        .into_iter()
        .filter_map(|t| match (t.exit_time, t.pnl) {
            (Some(exit), Some(pnl)) if exit.as_str() >= cutoff_iso.as_str() => {
                Some(TodayTrade {
                    symbol: t.symbol,
                    side: t.side,
                    pnl,
                    exit_time: exit,
                })
            }
            _ => None,
        })
        .collect();

    tracing::info!(
        "account_fetch_today_trades: kept {} closed trades since {}",
        today.len(),
        cutoff_iso,
    );
    Ok(today)
}

/// Convert Unix seconds → "YYYY-MM-DDTHH:MM:SSZ" without pulling chrono.
/// Same Hinnant `civil_from_days` algo used in the finnhub news decoder.
fn format_unix_to_iso8601(unix_secs: i64) -> String {
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
