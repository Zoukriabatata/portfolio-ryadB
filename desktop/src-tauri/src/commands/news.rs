//! Tauri commands for the News module. Wraps the Finnhub connector
//! behind two cached endpoints (calendar + articles).

use std::time::Duration;
use tauri::State;

use crate::connectors::finnhub::{
    api_key, fetch_calendar, fetch_news, EconomicEvent, FinnhubClient, NewsArticle, TtlCache,
};

const CALENDAR_TTL: Duration = Duration::from_secs(5 * 60);
const NEWS_TTL: Duration = Duration::from_secs(60);

pub struct NewsState {
    pub calendar_cache: TtlCache<Vec<EconomicEvent>>,
    pub news_cache: TtlCache<Vec<NewsArticle>>,
}

impl NewsState {
    pub fn new() -> Self {
        Self {
            calendar_cache: TtlCache::new(CALENDAR_TTL),
            news_cache: TtlCache::new(NEWS_TTL),
        }
    }
}

impl Default for NewsState {
    fn default() -> Self { Self::new() }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchCalendarArgs {
    pub from_date: String, // "YYYY-MM-DD"
    pub to_date: String,
}

#[tauri::command]
pub async fn news_fetch_calendar(
    state: State<'_, NewsState>,
    args: FetchCalendarArgs,
) -> Result<Vec<EconomicEvent>, String> {
    let cache_key = format!("cal|{}|{}", args.from_date, args.to_date);
    if let Some(hit) = state.calendar_cache.get(&cache_key).await {
        tracing::info!("news_fetch_calendar: cache hit {} entries", hit.len());
        return Ok(hit);
    }
    let api_key = api_key::load()
        .map_err(|e| format!("finnhub vault: {e}"))?
        .ok_or_else(|| "Finnhub API key not configured — set it in Settings".to_string())?;
    let client = FinnhubClient::new(api_key).map_err(|e| e.to_string())?;
    let events = fetch_calendar(&client, &args.from_date, &args.to_date)
        .await
        .map_err(|e| e.to_string())?;
    tracing::info!("news_fetch_calendar: fetched {} events", events.len());
    state.calendar_cache.set(cache_key, events.clone()).await;
    Ok(events)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchArticlesArgs {
    pub category: String,
}

#[tauri::command]
pub async fn news_fetch_articles(
    state: State<'_, NewsState>,
    args: FetchArticlesArgs,
) -> Result<Vec<NewsArticle>, String> {
    let cache_key = format!("news|{}", args.category);
    if let Some(hit) = state.news_cache.get(&cache_key).await {
        tracing::info!("news_fetch_articles: cache hit {} entries", hit.len());
        return Ok(hit);
    }
    let api_key = api_key::load()
        .map_err(|e| format!("finnhub vault: {e}"))?
        .ok_or_else(|| "Finnhub API key not configured — set it in Settings".to_string())?;
    let client = FinnhubClient::new(api_key).map_err(|e| e.to_string())?;
    let articles = fetch_news(&client, &args.category)
        .await
        .map_err(|e| e.to_string())?;
    tracing::info!("news_fetch_articles: fetched {} articles", articles.len());
    state.news_cache.set(cache_key, articles.clone()).await;
    Ok(articles)
}

#[tauri::command]
pub async fn news_save_api_key(key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        return Err("API key is empty".to_string());
    }
    tokio::task::spawn_blocking(move || api_key::save(&trimmed))
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn news_has_api_key() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| api_key::load())
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map(|opt| opt.is_some())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn news_delete_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(|| api_key::delete())
        .await
        .map_err(|e| format!("task panicked: {e}"))?
        .map_err(|e| e.to_string())
}
