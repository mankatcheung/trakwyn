//! Cache-aside, with an in-process implementation for dev and tests and a
//! Redis one shared across instances in production.

mod bounded_map;
pub mod cache_keys;
mod circuit_breaker;
pub mod constants;
mod insertion_ordered;
mod instrumented;
mod memory;
mod redis;
mod redis_client;
pub(crate) mod redis_resilience;
#[cfg(test)]
pub(crate) mod test_support;
mod upstash;

pub use bounded_map::BoundedMap;
pub use circuit_breaker::{BreakerError, CircuitBreaker, CircuitState, StateChangeListener};
pub use instrumented::InstrumentedCache;
pub use memory::MemoryCache;
pub use redis::RedisCache;
pub use redis_client::{RedisClient, RedisError, SetOptions};
pub use upstash::UpstashRedisClient;

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::use_cases::errors::{DomainError, DomainResult};

/// The future a [`JsonFetch`] returns.
pub type JsonFetchFuture<'a> = Pin<Box<dyn Future<Output = DomainResult<Value>> + Send + 'a>>;

/// Loads the value a key stands for, as JSON. A cache may call it more than
/// once for a single read (see `RedisCache`), so it is a `Fn`.
pub type JsonFetch<'r, 'f> = &'r (dyn Fn() -> JsonFetchFuture<'f> + Send + Sync);

/// Cache-aside port implemented by `MemoryCache` (per instance, dev and
/// tests) and `RedisCache` (shared across instances, production).
///
/// There is a single read primitive rather than separate `get` and `set`
/// methods: every read-through call site follows a miss with a set of the
/// same fetched value, and folding that into one method is what lets an
/// implementation guard against cache stampedes (only one caller actually
/// invokes `fetch` on a miss; concurrent callers for the same key wait for
/// its result instead of all reaching the database).
///
/// Values cross this trait as JSON so it stays object-safe and so both
/// implementations hand back the same shape on a hit as on a miss. Callers
/// use [`CacheExt::get_or_set`], which is typed.
///
/// `delete` and `delete_by_prefix` cannot fail: a skipped invalidation leaves
/// an entry that expires through its TTL, which the design already accepts.
#[async_trait]
pub trait Cache: Send + Sync {
    /// `ttl` of `None` means the implementation's default.
    async fn get_or_set_json(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Option<Duration>,
    ) -> DomainResult<Value>;

    async fn delete(&self, key: &str);

    /// Removes every entry whose key starts with `prefix`.
    async fn delete_by_prefix(&self, prefix: &str);
}

/// Adapts a typed fetch to the JSON one a [`Cache`] takes.
fn json_fetch<'a, T, F, Fut>(fetch: &'a F) -> impl Fn() -> JsonFetchFuture<'a> + Send + Sync + 'a
where
    T: Serialize,
    F: Fn() -> Fut + Send + Sync,
    Fut: Future<Output = DomainResult<T>> + Send + 'a,
{
    move || {
        Box::pin(async move {
            let value = fetch().await?;
            serde_json::to_value(&value).map_err(DomainError::internal)
        })
    }
}

/// The typed read every caller uses, for any [`Cache`] including
/// `dyn Cache`.
pub trait CacheExt: Cache {
    /// Returns the cached value for `key`, or runs `fetch`, caches what it
    /// returns and hands that back.
    ///
    /// `T` goes through `serde`, so what is cached is its JSON form: a type
    /// cached here needs `Serialize` and `Deserialize`, and to share entries
    /// with `apps/api` its JSON must match what that implementation stores
    /// (camelCase field names, ISO-8601 timestamps).
    ///
    /// A cached entry that no longer deserializes as `T` (written by another
    /// version, or by the other implementation in a different shape) is
    /// treated like a failed cache: `fetch` runs and its result is returned.
    fn get_or_set<T, F, Fut>(
        &self,
        key: &str,
        fetch: F,
        ttl: Option<Duration>,
    ) -> impl Future<Output = DomainResult<T>> + Send
    where
        T: Serialize + DeserializeOwned + Send,
        F: Fn() -> Fut + Send + Sync,
        Fut: Future<Output = DomainResult<T>> + Send,
    {
        async move {
            let value = {
                let as_json = json_fetch(&fetch);
                self.get_or_set_json(key, &as_json, ttl).await?
            };
            match serde_json::from_value(value) {
                Ok(typed) => Ok(typed),
                Err(err) => {
                    // Neither the key nor the error's text: either can quote
                    // user data (an email in a key, a field's value in the text).
                    tracing::warn!(
                        category = ?err.classify(),
                        "[cache] cached entry did not match the expected shape; fetching directly"
                    );
                    fetch().await
                }
            }
        }
    }
}

impl<C: Cache + ?Sized> CacheExt for C {}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use chrono::{DateTime, Utc};
    use serde::Deserialize;

    use super::*;

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Round {
        id: String,
        scheduled_at: DateTime<Utc>,
        notes: Option<String>,
    }

    fn round() -> Round {
        Round {
            id: "round-1".to_string(),
            scheduled_at: "2026-09-01T10:00:00.000Z".parse().unwrap(),
            notes: None,
        }
    }

    #[tokio::test]
    async fn hands_back_a_typed_value_with_its_timestamps_on_a_hit() {
        let cache: Arc<dyn Cache> = Arc::new(MemoryCache::default());
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(round())
        };

        let miss = cache.get_or_set("key", fetch, None).await.unwrap();
        let hit = cache.get_or_set("key", fetch, None).await.unwrap();

        assert_eq!(miss, round());
        assert_eq!(hit, round());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn caches_an_absent_value_as_a_valid_result_distinct_from_a_miss() {
        let cache = MemoryCache::default();
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(None::<Round>)
        };

        assert_eq!(cache.get_or_set("nullable", fetch, None).await.unwrap(), None);
        assert_eq!(cache.get_or_set("nullable", fetch, None).await.unwrap(), None);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn passes_a_fetch_failure_through() {
        let cache = MemoryCache::default();

        let err = cache
            .get_or_set("key", || async { Err::<Round, _>(DomainError::not_found("Round")) }, None)
            .await
            .unwrap_err();

        assert_eq!(err.to_string(), "Round not found");
    }

    #[tokio::test]
    async fn fetches_directly_when_the_cached_entry_has_another_shape() {
        let cache = MemoryCache::default();
        cache.get_or_set("key", || async { Ok("not a round".to_string()) }, None).await.unwrap();

        let value = cache.get_or_set("key", || async { Ok(round()) }, None).await.unwrap();

        assert_eq!(value, round());
    }

    /// `apps/api` revives a cached string as a date only when it has at most
    /// three fractional digits and a `Z` suffix; `clock::now()` is truncated
    /// to the millisecond, so what this implementation stores always does.
    #[test]
    fn writes_timestamps_in_the_form_the_original_revives() {
        let json = serde_json::to_value(round()).unwrap();
        assert_eq!(json["scheduledAt"], "2026-09-01T10:00:00Z");

        let with_millis: DateTime<Utc> = "2026-09-01T10:00:00.250Z".parse().unwrap();
        assert_eq!(serde_json::to_value(with_millis).unwrap(), "2026-09-01T10:00:00.250Z");
    }
}
