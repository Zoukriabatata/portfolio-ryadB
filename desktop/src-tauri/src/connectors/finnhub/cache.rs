//! TTL cache for Finnhub responses. Single-process, in-memory.
//! Keyed by an arbitrary string (caller composes "endpoint|params").
//! Cleared at app boot — pas de persistance disque.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Generic single-typed cache. Each instance holds entries of `T`.
pub struct TtlCache<T: Clone + Send + Sync + 'static> {
    inner: Arc<RwLock<HashMap<String, (Instant, T)>>>,
    ttl: Duration,
}

impl<T: Clone + Send + Sync + 'static> TtlCache<T> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            ttl,
        }
    }

    /// Return the cached value if its age is `<= ttl`, else `None`.
    pub async fn get(&self, key: &str) -> Option<T> {
        let guard = self.inner.read().await;
        let (inserted_at, value) = guard.get(key)?;
        if inserted_at.elapsed() <= self.ttl {
            Some(value.clone())
        } else {
            None
        }
    }

    pub async fn set(&self, key: String, value: T) {
        let mut guard = self.inner.write().await;
        guard.insert(key, (Instant::now(), value));
    }
}

impl<T: Clone + Send + Sync + 'static> Clone for TtlCache<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            ttl: self.ttl,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::sleep;

    #[tokio::test]
    async fn returns_value_within_ttl() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_secs(1));
        cache.set("k".into(), "v".into()).await;
        assert_eq!(cache.get("k").await, Some("v".into()));
    }

    #[tokio::test]
    async fn returns_none_after_ttl() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_millis(20));
        cache.set("k".into(), "v".into()).await;
        sleep(Duration::from_millis(50)).await;
        assert_eq!(cache.get("k").await, None);
    }

    #[tokio::test]
    async fn missing_key_is_none() {
        let cache: TtlCache<String> = TtlCache::new(Duration::from_secs(1));
        assert_eq!(cache.get("absent").await, None);
    }
}
