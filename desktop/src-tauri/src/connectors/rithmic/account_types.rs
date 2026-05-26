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
