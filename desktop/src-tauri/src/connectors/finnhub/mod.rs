//! Finnhub.io REST client — feeds the News module (économic calendar
//! + market news). Quota gratuit : 60 req/min, partagé entre toutes
//! les requêtes (calendar + news). Le cache TTL côté `cache.rs`
//! protège ce quota en évitant les refetch trop fréquents.

pub mod error;

pub use error::{FinnhubError, Result};
