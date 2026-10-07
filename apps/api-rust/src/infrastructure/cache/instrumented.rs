use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;

use super::{Cache, JsonFetch, JsonFetchFuture};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::Metrics;

/// Records cache hit and miss counters around any `Cache`.
///
/// Deliberately a decorator at the port boundary rather than counters inside
/// `MemoryCache` and `RedisCache`: both implementations are then measured
/// identically, so a hit rate observed locally means the same thing as one
/// observed in production.
///
/// **How hit and miss are told apart:** a read returns a value either way, so
/// the outcome is not visible in its result. Instead the caller's `fetch` is
/// wrapped, and its invocation is the signal: the underlying fetch runs on a
/// miss and is skipped on a hit, which is precisely the distinction worth
/// measuring (did this call cost a database round trip?).
///
/// A single read counts at most one miss even if the inner cache invokes
/// `fetch` more than once (`RedisCache` can, when `fetch` succeeded but the
/// write-back to Redis then failed): one caller request is one hit or miss.
///
/// Expiry is *not* counted separately from miss. `RedisCache` cannot tell
/// them apart (an expired Redis key is simply absent on `GET`), so an expiry
/// counter would be measurable in dev and permanently zero in production.
pub struct InstrumentedCache {
    inner: Arc<dyn Cache>,
    metrics: Arc<dyn Metrics>,
}

impl InstrumentedCache {
    pub fn new(inner: Arc<dyn Cache>, metrics: Arc<dyn Metrics>) -> Self {
        Self { inner, metrics }
    }
}

#[async_trait]
impl Cache for InstrumentedCache {
    async fn get_or_set_json(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Option<Duration>,
    ) -> DomainResult<Value> {
        let fetched = AtomicBool::new(false);
        let watched = || -> JsonFetchFuture<'_> {
            fetched.store(true, Ordering::SeqCst);
            fetch()
        };
        let value = self.inner.get_or_set_json(key, &watched, ttl).await?;

        if fetched.load(Ordering::SeqCst) {
            self.metrics.record_cache_miss();
        } else {
            self.metrics.record_cache_hit();
        }
        Ok(value)
    }

    async fn delete(&self, key: &str) {
        self.inner.delete(key).await;
    }

    async fn delete_by_prefix(&self, prefix: &str) {
        self.inner.delete_by_prefix(prefix).await;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use serde_json::json;

    use super::super::{CacheExt, MemoryCache};
    use super::*;
    use crate::use_cases::errors::DomainError;
    use crate::use_cases::test_support::FakeMetrics;

    fn make_cache(inner: Arc<dyn Cache>) -> (InstrumentedCache, Arc<FakeMetrics>) {
        let metrics = Arc::new(FakeMetrics::default());
        (InstrumentedCache::new(inner, metrics.clone()), metrics)
    }

    fn over_memory() -> (InstrumentedCache, Arc<FakeMetrics>) {
        make_cache(Arc::new(MemoryCache::default()))
    }

    async fn read(cache: &InstrumentedCache, value: Value) -> Value {
        cache.get_or_set("key-1", || async { Ok(value.clone()) }, None).await.unwrap()
    }

    #[tokio::test]
    async fn counts_a_miss_when_the_value_has_to_be_fetched() {
        let (cache, metrics) = over_memory();

        read(&cache, json!("value")).await;

        assert_eq!(metrics.misses(), 1);
        assert_eq!(metrics.hits(), 0);
    }

    #[tokio::test]
    async fn counts_a_hit_when_a_second_read_is_served_without_fetching() {
        let (cache, metrics) = over_memory();

        read(&cache, json!("value")).await;
        read(&cache, json!("value")).await;

        assert_eq!(metrics.misses(), 1);
        assert_eq!(metrics.hits(), 1);
    }

    #[tokio::test]
    async fn counts_a_miss_again_once_the_entry_has_been_invalidated() {
        let (cache, metrics) = over_memory();

        read(&cache, json!("value")).await;
        read(&cache, json!("value")).await;
        cache.delete("key-1").await;
        read(&cache, json!("value")).await;

        assert_eq!(metrics.hits(), 1);
        assert_eq!(metrics.misses(), 2);
    }

    #[tokio::test]
    async fn still_returns_the_underlying_value_unchanged() {
        let (cache, _) = over_memory();

        assert_eq!(read(&cache, json!({ "a": 1 })).await, json!({ "a": 1 }));
        assert_eq!(read(&cache, json!({ "a": 2 })).await, json!({ "a": 1 }));
    }

    /// A cache that calls `fetch` twice, as `RedisCache` can.
    struct DoubleFetching;

    #[async_trait]
    impl Cache for DoubleFetching {
        async fn get_or_set_json(
            &self,
            _key: &str,
            fetch: JsonFetch<'_, '_>,
            _ttl: Option<Duration>,
        ) -> DomainResult<Value> {
            fetch().await?;
            fetch().await
        }
        async fn delete(&self, _key: &str) {}
        async fn delete_by_prefix(&self, _prefix: &str) {}
    }

    #[tokio::test]
    async fn counts_one_miss_per_call_even_if_the_inner_cache_fetches_twice() {
        let (cache, metrics) = make_cache(Arc::new(DoubleFetching));

        read(&cache, json!("value")).await;

        assert_eq!(metrics.misses(), 1);
    }

    /// A cache that fails without fetching, and records what it was asked to delete.
    #[derive(Default)]
    struct Failing {
        deleted: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl Cache for Failing {
        async fn get_or_set_json(
            &self,
            _key: &str,
            _fetch: JsonFetch<'_, '_>,
            _ttl: Option<Duration>,
        ) -> DomainResult<Value> {
            Err(DomainError::internal("boom"))
        }
        async fn delete(&self, key: &str) {
            self.deleted.lock().unwrap().push(format!("key {key}"));
        }
        async fn delete_by_prefix(&self, prefix: &str) {
            self.deleted.lock().unwrap().push(format!("prefix {prefix}"));
        }
    }

    #[tokio::test]
    async fn records_nothing_when_the_inner_cache_fails() {
        let (cache, metrics) = make_cache(Arc::new(Failing::default()));

        let outcome = cache.get_or_set("key-1", || async { Ok(1) }, None).await;

        assert!(outcome.is_err());
        assert_eq!(metrics.hits(), 0);
        assert_eq!(metrics.misses(), 0);
    }

    #[tokio::test]
    async fn passes_delete_and_delete_by_prefix_straight_through() {
        let inner = Arc::new(Failing::default());
        let (cache, _) = make_cache(inner.clone());

        cache.delete("key-1").await;
        cache.delete_by_prefix("prefix:").await;

        assert_eq!(*inner.deleted.lock().unwrap(), vec!["key key-1", "prefix prefix:"]);
    }
}
