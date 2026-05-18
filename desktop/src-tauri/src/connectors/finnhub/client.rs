//! Thin reqwest wrapper that knows how to talk to api.finnhub.io.
//! Adds the API key as a query param `token=...` (Finnhub convention),
//! maps HTTP status codes to typed errors.

use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::connectors::finnhub::error::{FinnhubError, Result};

const BASE_URL: &str = "https://finnhub.io/api/v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub struct FinnhubClient {
    http: reqwest::Client,
    api_key: String,
}

impl FinnhubClient {
    pub fn new(api_key: String) -> Result<Self> {
        if api_key.trim().is_empty() {
            return Err(FinnhubError::NoApiKey);
        }
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, api_key })
    }

    /// GET `BASE_URL/{path}?{query}&token={key}` and decode JSON as `T`.
    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T> {
        let url = format!("{}/{}", BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .query(query)
            .query(&[("token", self.api_key.as_str())])
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let text = resp.text().await?;
                serde_json::from_str(&text)
                    .map_err(|e| FinnhubError::Decode(e.to_string()))
            }
            401 => Err(FinnhubError::Unauthorized),
            429 => Err(FinnhubError::RateLimited),
            code => Err(FinnhubError::Upstream(code)),
        }
    }
}
