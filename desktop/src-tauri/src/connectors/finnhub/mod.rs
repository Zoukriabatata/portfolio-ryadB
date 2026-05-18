//! Finnhub.io REST client — feeds the News module (économic calendar
//! + market news). Quota gratuit : 60 req/min, partagé entre toutes
//! les requêtes (calendar + news). Le cache TTL côté `cache.rs`
//! protège ce quota en évitant les refetch trop fréquents.

pub mod cache;
pub mod client;
pub mod error;

pub use cache::TtlCache;
pub use client::FinnhubClient;
pub use error::{FinnhubError, Result};
