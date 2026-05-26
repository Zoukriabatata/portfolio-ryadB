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
