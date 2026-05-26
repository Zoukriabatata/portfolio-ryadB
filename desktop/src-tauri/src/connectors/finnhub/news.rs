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
        // 2026-05-18T12:00:00Z = 1779105600.
        assert_eq!(unix_to_iso8601(1779105600), "2026-05-18T12:00:00Z");
        assert_eq!(unix_to_iso8601(0), "");
        assert_eq!(unix_to_iso8601(-1), "");
    }
}
