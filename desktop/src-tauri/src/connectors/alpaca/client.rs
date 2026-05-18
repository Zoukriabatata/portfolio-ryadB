//! Thin reqwest wrapper for the Alpaca Market Data API.
//! Auth via two headers: APCA-API-KEY-ID + APCA-API-SECRET-KEY.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::connectors::alpaca::error::{AlpacaError, Result};

const DATA_BASE_URL: &str = "https://data.alpaca.markets";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub struct AlpacaClient {
    http: reqwest::Client,
    key_id: String,
    secret_key: String,
}

impl AlpacaClient {
    pub fn new(key_id: String, secret_key: String) -> Result<Self> {
        if key_id.trim().is_empty() || secret_key.trim().is_empty() {
            return Err(AlpacaError::NoApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, key_id, secret_key })
    }

    /// GET `DATA_BASE_URL/{path}?{query}` with Alpaca auth headers.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T> {
        let url = format!("{}/{}", DATA_BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .header("APCA-API-KEY-ID", &self.key_id)
            .header("APCA-API-SECRET-KEY", &self.secret_key)
            .header("Accept", "application/json")
            .query(query)
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let text = resp.text().await?;
                serde_json::from_str(&text)
                    .map_err(|e| AlpacaError::Decode(e.to_string()))
            }
            401 | 403 => Err(AlpacaError::Unauthorized),
            429 => Err(AlpacaError::RateLimited),
            code => Err(AlpacaError::Upstream(code)),
        }
    }
}
