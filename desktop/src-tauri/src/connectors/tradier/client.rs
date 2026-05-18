//! Thin reqwest wrapper for the Tradier Sandbox REST API.
//! Bearer auth on every request. Maps HTTP status to typed errors.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::connectors::tradier::error::{Result, TradierError};

const BASE_URL: &str = "https://sandbox.tradier.com/v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub struct TradierClient {
    http: reqwest::Client,
    api_key: String,
}

impl TradierClient {
    pub fn new(api_key: String) -> Result<Self> {
        if api_key.trim().is_empty() {
            return Err(TradierError::NoApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, api_key })
    }

    /// GET `BASE_URL/{path}?{query}` with bearer auth + JSON Accept header.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T> {
        let url = format!("{}/{}", BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Accept", "application/json")
            .query(query)
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let text = resp.text().await?;
                serde_json::from_str(&text)
                    .map_err(|e| TradierError::Decode(e.to_string()))
            }
            401 => Err(TradierError::Unauthorized),
            429 => Err(TradierError::RateLimited),
            code => Err(TradierError::Upstream(code)),
        }
    }
}
