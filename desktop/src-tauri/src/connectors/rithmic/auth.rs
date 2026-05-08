//! Authenticated Rithmic session state.
//!
//! Populated by `RithmicAdapter::login()` from the fields returned in
//! ResponseLogin (template_id 11). The heartbeat interval is what
//! Phase 7.6 will use to drive the keepalive task.

#[derive(Debug, Clone)]
pub struct RithmicSession {
    pub user: String,
    pub system_name: String,
    pub fcm_id: String,
    pub ib_id: String,
    pub country_code: String,
    pub state_code: String,
    pub unique_user_id: String,
    /// Server-suggested heartbeat cadence. Defaults to 60s if the
    /// gateway omits the field.
    pub heartbeat_interval_secs: f64,
}
