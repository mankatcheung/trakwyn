use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use super::circuit_breaker::{BreakerError, CircuitBreaker};
use super::constants::{
    DEFAULT_TTL, STAMPEDE_LOCK_TTL, STAMPEDE_MAX_POLL_ATTEMPTS, STAMPEDE_POLL_INTERVAL,
};
use super::redis_client::{RedisClient, RedisError, SetOptions};
use super::redis_resilience::{report_fail_open, reporting_breaker};
use super::{Cache, JsonFetch};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::{FailOpenReason, MetricComponent};
use crate::use_cases::ports::Metrics;

const COMPONENT: MetricComponent = MetricComponent::Cache;
const LOG_LABEL: &str = "cache";
const LOCK_KEY_PREFIX: &str = "lock:";
/// How many keys one `SCAN` page asks for when deleting by prefix.
const SCAN_PAGE_SIZE: u32 = 100;
const SCAN_START: &str = "0";

const GET_OR_SET_FAILED: &str = "[cache] Redis error in getOrSet — falling back to a direct fetch";
const DELETE_FAILED: &str = "[cache] Redis error while deleting a cache key — invalidation skipped";
const DELETE_BY_PREFIX_FAILED: &str =
    "[cache] Redis error while deleting cache keys by prefix — invalidation skipped";

/// Cached values are wrapped in `{ "v": … }` rather than stored raw. A `GET`
/// answers null both when a key is absent and when the stored JSON value is
/// literally `null`; wrapping lets the cache tell "never cached" apart from
/// "cached, and the answer is null" (a `find_by_id` caching a genuine
/// not-found result), which several cached repositories rely on.
fn wrap(value: &Value) -> Value {
    json!({ "v": value })
}

fn unwrap(envelope: Value) -> Value {
    match envelope {
        Value::Object(mut fields) => fields.remove("v").unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

/// Why the Redis path of a read gave up.
enum Failure {
    Redis(BreakerError<RedisError>),
    Fetch(DomainError),
}

impl From<BreakerError<RedisError>> for Failure {
    fn from(err: BreakerError<RedisError>) -> Self {
        Self::Redis(err)
    }
}

/// Redis-backed `Cache`, shared across every instance: it closes the
/// cross-instance invalidation gap a per-instance `MemoryCache` has once more
/// than one instance is serving.
///
/// A read also guards against cache stampedes: on a miss, only the caller
/// that wins a short-lived `NX` lock actually calls `fetch`. Concurrent
/// misses for the same key (on this instance or another: the lock lives in
/// Redis, not in process memory) poll briefly for the winner's result instead
/// of every one of them reaching the database at once. If the winner does not
/// finish within the poll budget (it crashed mid-fetch, or is just slow), a
/// waiter falls back to fetching directly itself rather than waiting forever.
///
/// Every Redis call goes through a `CircuitBreaker`: Redis is an add-on
/// reliability and performance layer, not a dependency the app should go down
/// with. On any failure (a genuine Redis error, or the breaker already being
/// open) a read falls back to calling `fetch` directly, skipping the cache
/// and the stampede lock; `delete` and `delete_by_prefix` swallow the
/// failure, since a stale entry that outlives its TTL is a risk the design
/// already accepts.
pub struct RedisCache {
    redis: Arc<dyn RedisClient>,
    lock_ttl: Duration,
    poll_interval: Duration,
    max_poll_attempts: u32,
    breaker: CircuitBreaker,
    metrics: Arc<dyn Metrics>,
    logger: Arc<dyn Logger>,
}

impl RedisCache {
    pub fn new(
        redis: Arc<dyn RedisClient>,
        metrics: Arc<dyn Metrics>,
        logger: Arc<dyn Logger>,
    ) -> Self {
        let breaker =
            reporting_breaker(COMPONENT, LOG_LABEL, Arc::clone(&metrics), Arc::clone(&logger));
        Self {
            redis,
            lock_ttl: STAMPEDE_LOCK_TTL,
            poll_interval: STAMPEDE_POLL_INTERVAL,
            max_poll_attempts: STAMPEDE_MAX_POLL_ATTEMPTS,
            breaker,
            metrics,
            logger,
        }
    }

    /// Replaces the default breaker, which is the one that logs and counts
    /// its transitions.
    pub fn with_breaker(mut self, breaker: CircuitBreaker) -> Self {
        self.breaker = breaker;
        self
    }

    /// Overrides the stampede-lock tuning.
    pub fn with_stampede_lock(
        mut self,
        lock_ttl: Duration,
        poll_interval: Duration,
        max_poll_attempts: u32,
    ) -> Self {
        self.lock_ttl = lock_ttl;
        self.poll_interval = poll_interval;
        self.max_poll_attempts = max_poll_attempts;
        self
    }

    async fn read(&self, key: &str) -> Result<Option<Value>, BreakerError<RedisError>> {
        self.breaker.execute(|| self.redis.get(key)).await
    }

    async fn fetch_and_store(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Duration,
    ) -> Result<Value, Failure> {
        let value = fetch().await.map_err(Failure::Fetch)?;
        let envelope = wrap(&value);
        self.breaker.execute(|| self.redis.set(key, &envelope, SetOptions::px(ttl))).await?;
        Ok(value)
    }

    async fn get_or_set_via_redis(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Duration,
    ) -> Result<Value, Failure> {
        if let Some(hit) = self.read(key).await? {
            return Ok(unwrap(hit));
        }

        let lock_key = format!("{LOCK_KEY_PREFIX}{key}");
        let lock = json!("1");
        let acquired = self
            .breaker
            .execute(|| self.redis.set(&lock_key, &lock, SetOptions::nx_px(self.lock_ttl)))
            .await?;

        if acquired {
            let outcome = self.fetch_and_store(key, fetch, ttl).await;
            // Best effort: an unlock failure is not worth discarding an
            // otherwise successful result over, and the lock's own TTL
            // expires it regardless.
            let lock_keys = [lock_key];
            let _ = self.breaker.execute(|| self.redis.del(&lock_keys)).await;
            return outcome;
        }

        for _ in 0..self.max_poll_attempts {
            tokio::time::sleep(self.poll_interval).await;
            if let Some(hit) = self.read(key).await? {
                return Ok(unwrap(hit));
            }
        }

        // The lock-holder did not finish in time: fetch directly rather than
        // waiting forever, and still populate the cache for the next reader.
        self.fetch_and_store(key, fetch, ttl).await
    }

    async fn delete_matching(&self, prefix: &str) -> Result<(), BreakerError<RedisError>> {
        let pattern = format!("{prefix}*");
        let mut cursor = SCAN_START.to_string();
        loop {
            let (next, keys) = self
                .breaker
                .execute(|| self.redis.scan(&cursor, Some(&pattern), Some(SCAN_PAGE_SIZE)))
                .await?;
            if !keys.is_empty() {
                self.breaker.execute(|| self.redis.del(&keys)).await?;
            }
            cursor = next;
            if cursor == SCAN_START {
                return Ok(());
            }
        }
    }

    fn report(&self, err: &BreakerError<RedisError>, message: &str) {
        report_fail_open(self.metrics.as_ref(), self.logger.as_ref(), COMPONENT, err, message);
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get_or_set_json(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Option<Duration>,
    ) -> DomainResult<Value> {
        let failure = match self.get_or_set_via_redis(key, fetch, ttl.unwrap_or(DEFAULT_TTL)).await
        {
            Ok(value) => return Ok(value),
            Err(failure) => failure,
        };
        match &failure {
            Failure::Redis(err) => self.report(err, GET_OR_SET_FAILED),
            // As in the original, a failure of `fetch` itself on the Redis
            // path is handled no differently from a Redis one: it is counted
            // and logged as a fail-open, and `fetch` is tried once more.
            Failure::Fetch(err) => {
                self.metrics.record_fail_open(COMPONENT, FailOpenReason::Error);
                self.logger.error(GET_OR_SET_FAILED, Some(err), &[]);
            }
        }
        // If `fetch` already succeeded and only the write-back to Redis
        // failed, this calls it a second time. Rare (a failure at exactly
        // that step) and cheap enough that avoiding it is not worth the
        // extra branching.
        fetch().await
    }

    async fn delete(&self, key: &str) {
        let keys = [key.to_string()];
        if let Err(err) = self.breaker.execute(|| self.redis.del(&keys)).await {
            self.report(&err, DELETE_FAILED);
        }
    }

    /// Redis has no native delete-by-prefix: this walks the keyspace with
    /// `SCAN` (cursor-based, non-blocking) matching `{prefix}*` and deletes
    /// the matches in batches. Fine at this app's scale; it would need a
    /// per-prefix key-set index if a full pass ever became expensive.
    async fn delete_by_prefix(&self, prefix: &str) {
        if let Err(err) = self.delete_matching(prefix).await {
            self.report(&err, DELETE_BY_PREFIX_FAILED);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Serialize};
    use tokio::sync::Notify;

    use super::super::test_support::{FakeRedisClient, StubUpstash};
    use super::super::{CacheExt, UpstashRedisClient};
    use super::*;
    use crate::use_cases::ports::metrics::FailOpenReason;
    use crate::use_cases::test_support::metrics::{CircuitTransitionEvent, FailOpenEvent};
    use crate::use_cases::test_support::{FakeLogger, FakeMetrics, LogLevel};

    struct Harness {
        cache: Arc<RedisCache>,
        redis: Arc<FakeRedisClient>,
        metrics: Arc<FakeMetrics>,
        logger: Arc<FakeLogger>,
    }

    fn harness_with(
        redis: FakeRedisClient,
        tune: impl FnOnce(RedisCache) -> RedisCache,
    ) -> Harness {
        let redis = Arc::new(redis);
        let metrics = Arc::new(FakeMetrics::default());
        let logger = Arc::new(FakeLogger::default());
        let cache = RedisCache::new(redis.clone(), metrics.clone(), logger.clone());
        Harness { cache: Arc::new(tune(cache)), redis, metrics, logger }
    }

    /// A high threshold, so the tests that are not about the breaker never
    /// trip it.
    fn harness() -> Harness {
        harness_with(FakeRedisClient::default(), |cache| {
            cache.with_breaker(CircuitBreaker::new(1000, Duration::from_secs(30)))
        })
    }

    struct Counted {
        calls: AtomicUsize,
        value: Value,
    }

    impl Counted {
        fn new(value: Value) -> Self {
            Self { calls: AtomicUsize::new(0), value }
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }

        async fn read_with(&self, cache: &RedisCache, key: &str, ttl: Option<Duration>) -> Value {
            let fetch = || async {
                self.calls.fetch_add(1, Ordering::SeqCst);
                Ok(self.value.clone())
            };
            cache.get_or_set(key, fetch, ttl).await.unwrap()
        }

        async fn read(&self, cache: &RedisCache, key: &str) -> Value {
            self.read_with(cache, key, None).await
        }
    }

    const fn cache_error() -> FailOpenEvent {
        FailOpenEvent { component: MetricComponent::Cache, reason: FailOpenReason::Error }
    }

    #[tokio::test]
    async fn calls_fetch_and_caches_the_result_on_a_miss() {
        let h = harness();
        let fetch = Counted::new(json!("value"));

        assert_eq!(fetch.read(&h.cache, "key").await, json!("value"));
        assert_eq!(fetch.calls(), 1);
        assert_eq!(h.redis.raw_get("key").as_deref(), Some(r#"{"v":"value"}"#));
        assert_eq!(h.redis.raw_get("lock:key"), None);
    }

    #[tokio::test]
    async fn returns_the_cached_value_on_a_second_call_without_fetching_again() {
        let h = harness();
        let fetch = Counted::new(json!("value"));

        fetch.read(&h.cache, "key").await;
        assert_eq!(fetch.read(&h.cache, "key").await, json!("value"));
        assert_eq!(fetch.calls(), 1);
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Round {
        id: String,
        scheduled_at: DateTime<Utc>,
        nested: Nested,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct Nested {
        at: DateTime<Utc>,
    }

    #[tokio::test]
    async fn hands_back_real_timestamps_on_a_cache_hit() {
        let h = harness();
        let scheduled_at: DateTime<Utc> = "2026-09-01T10:00:00.000Z".parse().unwrap();
        let round =
            Round { id: "round-1".to_string(), scheduled_at, nested: Nested { at: scheduled_at } };
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(round.clone())
        };

        h.cache.get_or_set("key", fetch, None).await.unwrap(); // populates the cache
        let hit = h.cache.get_or_set("key", fetch, None).await.unwrap(); // served from it

        assert_eq!(hit, round);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    /// An entry `apps/api` wrote: `JSON.stringify` of `{ v }`, dates as
    /// `toISOString()` gives them.
    #[tokio::test]
    async fn reads_an_entry_the_original_implementation_wrote() {
        let h = harness();
        let written = r#"{"v":{"id":"round-1","scheduledAt":"2026-09-01T10:00:00.000Z","nested":{"at":"2026-09-01T10:00:00.000Z"}}}"#;
        h.redis.raw_set("key", &json!(written), SetOptions::default());

        let hit: Round = h
            .cache
            .get_or_set("key", || async { Err(DomainError::not_found("Round")) }, None)
            .await
            .unwrap();

        assert_eq!(hit.id, "round-1");
        assert_eq!(hit.scheduled_at.timestamp_millis(), 1_788_256_800_000);
    }

    #[tokio::test]
    async fn caches_a_null_result_as_a_valid_value_distinct_from_a_miss() {
        let h = harness();
        let fetch = Counted::new(Value::Null);

        assert_eq!(fetch.read(&h.cache, "nullable").await, Value::Null);
        assert_eq!(fetch.read(&h.cache, "nullable").await, Value::Null);
        assert_eq!(fetch.calls(), 1);
        assert_eq!(h.redis.raw_get("nullable").as_deref(), Some(r#"{"v":null}"#));
    }

    #[tokio::test(start_paused = true)]
    async fn expires_and_refetches_after_the_ttl_elapses() {
        let h = harness();
        let fetch = Counted::new(json!("value"));
        let ttl = Some(Duration::from_millis(10));

        fetch.read_with(&h.cache, "key", ttl).await;
        tokio::time::advance(Duration::from_millis(20)).await;
        fetch.read_with(&h.cache, "key", ttl).await;

        assert_eq!(fetch.calls(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn stores_an_entry_for_five_minutes_by_default() {
        let h = harness();
        let fetch = Counted::new(json!("value"));

        fetch.read(&h.cache, "key").await;
        tokio::time::advance(Duration::from_secs(5 * 60)).await;
        fetch.read(&h.cache, "key").await;
        assert_eq!(fetch.calls(), 1);

        tokio::time::advance(Duration::from_millis(1)).await;
        fetch.read(&h.cache, "key").await;
        assert_eq!(fetch.calls(), 2);
    }

    #[tokio::test]
    async fn stampede_only_the_lock_winner_fetches_and_the_other_waits_for_its_result() {
        let h = harness_with(FakeRedisClient::default(), |cache| {
            cache.with_stampede_lock(Duration::from_secs(10), Duration::from_millis(5), 50)
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(Notify::new());

        let first = {
            let (cache, calls, release) = (h.cache.clone(), calls.clone(), release.clone());
            tokio::spawn(async move {
                let fetch = || async {
                    calls.fetch_add(1, Ordering::SeqCst);
                    release.notified().await;
                    Ok("value".to_string())
                };
                cache.get_or_set("key", fetch, None).await
            })
        };
        // Let the first call's lock-acquire land before starting the second.
        tokio::time::sleep(Duration::from_millis(20)).await;
        let second = {
            let (cache, calls) = (h.cache.clone(), calls.clone());
            tokio::spawn(async move {
                let fetch = || async {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok("other".to_string())
                };
                cache.get_or_set("key", fetch, None).await
            })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;
        release.notify_one();

        assert_eq!(first.await.unwrap().unwrap(), "value");
        assert_eq!(second.await.unwrap().unwrap(), "value");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn falls_back_to_fetching_directly_if_the_lock_holder_never_finishes_in_time() {
        let h = harness_with(FakeRedisClient::default(), |cache| {
            cache.with_stampede_lock(Duration::from_secs(10), Duration::from_millis(2), 3)
        });
        // Another process holds the lock without ever populating the key.
        h.redis.raw_set("lock:key", &json!("1"), SetOptions::nx_px(Duration::from_secs(10)));
        let fetch = Counted::new(json!("fallback-value"));

        assert_eq!(fetch.read(&h.cache, "key").await, json!("fallback-value"));
        assert_eq!(fetch.calls(), 1);
        // It still populated the cache for the next reader.
        assert_eq!(h.redis.raw_get("key").as_deref(), Some(r#"{"v":"fallback-value"}"#));
        assert!(h.metrics.fail_opens().is_empty());
    }

    #[tokio::test]
    async fn takes_the_lock_with_its_ten_second_ttl_under_the_lock_prefix() {
        let h = harness();
        let release = Arc::new(Notify::new());
        let reading = {
            let (cache, release) = (h.cache.clone(), release.clone());
            tokio::spawn(async move {
                let fetch = || async {
                    release.notified().await;
                    Ok(1)
                };
                cache.get_or_set("key", fetch, None).await
            })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(h.redis.raw_get("lock:key").as_deref(), Some("1"));
        assert_eq!(h.cache.lock_ttl, Duration::from_secs(10));
        assert_eq!(h.cache.poll_interval, Duration::from_millis(50));
        assert_eq!(h.cache.max_poll_attempts, 20);

        release.notify_one();
        reading.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn delete_removes_a_specific_key() {
        let h = harness();
        let fetch_a = Counted::new(json!(1));
        let fetch_b = Counted::new(json!(2));
        fetch_a.read(&h.cache, "a").await;
        fetch_b.read(&h.cache, "b").await;

        h.cache.delete("a").await;

        fetch_a.read(&h.cache, "a").await;
        fetch_b.read(&h.cache, "b").await;
        assert_eq!(fetch_a.calls(), 2);
        assert_eq!(fetch_b.calls(), 1);
    }

    #[tokio::test]
    async fn delete_by_prefix_deletes_only_keys_matching_the_prefix() {
        let h = harness();
        let user1 = Counted::new(json!("list1"));
        let user2 = Counted::new(json!("list2"));
        let by_id = Counted::new(json!("single"));
        user1.read(&h.cache, "apps:list:user1:").await;
        user2.read(&h.cache, "apps:list:user2:").await;
        by_id.read(&h.cache, "apps:byId:abc").await;

        h.cache.delete_by_prefix("apps:list:user1:").await;

        user1.read(&h.cache, "apps:list:user1:").await;
        user2.read(&h.cache, "apps:list:user2:").await;
        by_id.read(&h.cache, "apps:byId:abc").await;
        assert_eq!(user1.calls(), 2);
        assert_eq!(user2.calls(), 1);
        assert_eq!(by_id.calls(), 1);
    }

    #[tokio::test]
    async fn delete_by_prefix_pages_through_scan_across_more_than_one_batch() {
        let h = harness();
        for index in 0..250 {
            let key = format!("apps:list:user1:{index}");
            h.redis.raw_set(&key, &json!(index), SetOptions::default());
        }
        h.redis.raw_set("apps:byId:keep", &json!("keep"), SetOptions::default());

        h.cache.delete_by_prefix("apps:list:user1:").await;

        assert_eq!(h.redis.raw_scan("0", None, Some(1000)).1, vec!["apps:byId:keep"]);
        let scans = h.redis.calls().iter().filter(|call| **call == "scan").count();
        assert_eq!(scans, 3);
    }

    #[tokio::test]
    async fn get_or_set_falls_back_to_fetch_when_redis_errors_instead_of_failing() {
        let h = harness();
        h.redis.set_failing(true);
        let fetch = Counted::new(json!("fallback-value"));

        assert_eq!(fetch.read(&h.cache, "key").await, json!("fallback-value"));
        assert_eq!(fetch.calls(), 1);
        assert_eq!(h.metrics.fail_opens(), vec![cache_error()]);

        let lines = h.logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Error);
        assert_eq!(lines[0].message, GET_OR_SET_FAILED);
        assert!(lines[0].error.is_some());
    }

    #[tokio::test]
    async fn fetches_a_second_time_when_only_the_write_back_fails() {
        struct ReadOnly(FakeRedisClient);

        #[async_trait]
        impl RedisClient for ReadOnly {
            async fn get(&self, key: &str) -> Result<Option<Value>, RedisError> {
                self.0.get(key).await
            }
            async fn set(&self, key: &str, v: &Value, o: SetOptions) -> Result<bool, RedisError> {
                if o.nx {
                    return self.0.set(key, v, o).await;
                }
                Err(RedisError::Transport("read only".into()))
            }
            async fn del(&self, keys: &[String]) -> Result<u64, RedisError> {
                self.0.del(keys).await
            }
            async fn incr(&self, key: &str) -> Result<i64, RedisError> {
                self.0.incr(key).await
            }
            async fn scan(
                &self,
                cursor: &str,
                pattern: Option<&str>,
                count: Option<u32>,
            ) -> Result<(String, Vec<String>), RedisError> {
                self.0.scan(cursor, pattern, count).await
            }
        }

        let metrics = Arc::new(FakeMetrics::default());
        let cache = RedisCache::new(
            Arc::new(ReadOnly(FakeRedisClient::default())),
            metrics.clone(),
            Arc::new(FakeLogger::default()),
        );
        let fetch = Counted::new(json!("value"));

        assert_eq!(fetch.read(&cache, "key").await, json!("value"));
        assert_eq!(fetch.calls(), 2);
        assert_eq!(metrics.fail_opens(), vec![cache_error()]);
    }

    /// Ported as it is: the original's `catch` does not tell a failing
    /// `fetch` from a failing Redis.
    #[tokio::test]
    async fn a_failing_fetch_is_counted_as_a_fail_open_and_tried_once_more() {
        let h = harness();
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err::<String, _>(DomainError::not_found("Skill"))
        };

        let err = h.cache.get_or_set("key", fetch, None).await.unwrap_err();

        assert_eq!(err.to_string(), "Skill not found");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(h.metrics.fail_opens(), vec![cache_error()]);
        assert_eq!(h.logger.lines()[0].message, GET_OR_SET_FAILED);
        // The lock was released on the way out.
        assert_eq!(h.redis.raw_get("lock:key"), None);
    }

    #[tokio::test]
    async fn delete_swallows_redis_errors_and_records_a_fail_open() {
        let h = harness();
        h.redis.set_failing(true);

        h.cache.delete("key").await;

        assert_eq!(h.metrics.fail_opens(), vec![cache_error()]);
        assert_eq!(h.logger.lines()[0].message, DELETE_FAILED);
    }

    #[tokio::test]
    async fn delete_by_prefix_swallows_redis_errors_and_records_a_fail_open() {
        let h = harness();
        h.redis.set_failing(true);

        h.cache.delete_by_prefix("apps:list:").await;

        assert_eq!(h.metrics.fail_opens(), vec![cache_error()]);
        assert_eq!(h.logger.lines()[0].message, DELETE_BY_PREFIX_FAILED);
    }

    #[tokio::test]
    async fn opens_the_circuit_after_repeated_failures_and_stops_calling_redis_at_all() {
        let h = harness_with(FakeRedisClient::default(), |cache| {
            cache.with_breaker(CircuitBreaker::new(1, Duration::from_secs(60)))
        });
        h.redis.set_failing(true);
        // First call: reaches Redis, fails, trips the breaker open.
        Counted::new(json!("a")).read(&h.cache, "key").await;

        // Redis is healthy again, but the breaker is still cooling down.
        h.redis.set_failing(false);
        let fetch = Counted::new(json!("b"));
        assert_eq!(fetch.read(&h.cache, "key").await, json!("b"));
        h.cache.delete("key").await;
        h.cache.delete_by_prefix("key").await;

        assert_eq!(fetch.calls(), 1);
        assert!(h.redis.calls().is_empty()); // short-circuited before touching Redis
        let open = FailOpenEvent {
            component: MetricComponent::Cache,
            reason: FailOpenReason::CircuitOpen,
        };
        assert_eq!(h.metrics.fail_opens(), vec![cache_error(), open.clone(), open.clone(), open]);
        // Only the genuine error was logged; an open breaker is not news.
        assert_eq!(h.logger.lines().len(), 1);
    }

    #[tokio::test]
    async fn the_default_breaker_logs_and_counts_its_transition_after_five_failures() {
        let h = harness_with(FakeRedisClient::broken(), |cache| cache);

        for index in 0..4 {
            Counted::new(json!("value")).read(&h.cache, &format!("key-{index}")).await;
        }
        assert!(h.metrics.circuit_transitions().is_empty());
        Counted::new(json!("value")).read(&h.cache, "key-4").await;

        assert_eq!(
            h.metrics.circuit_transitions(),
            vec![CircuitTransitionEvent {
                component: MetricComponent::Cache,
                from: "closed".to_string(),
                to: "open".to_string(),
            }]
        );
        let warnings: Vec<_> =
            h.logger.lines().into_iter().filter(|line| line.level == LogLevel::Warn).collect();
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].message, "[cache] Redis circuit breaker closed -> open");
        assert_eq!(warnings[0].error, None);
    }

    #[tokio::test]
    async fn works_end_to_end_over_the_rest_client() {
        let stub = StubUpstash::start().await;
        let redis = Arc::new(UpstashRedisClient::new(&stub.url(), "token").unwrap());
        let metrics = Arc::new(FakeMetrics::default());
        let cache = RedisCache::new(redis, metrics.clone(), Arc::new(FakeLogger::default()));
        let fetch = Counted::new(json!({ "id": "a", "tags": ["x"] }));

        assert_eq!(fetch.read(&cache, "apps:byId:a").await, json!({ "id": "a", "tags": ["x"] }));
        assert_eq!(fetch.read(&cache, "apps:byId:a").await, json!({ "id": "a", "tags": ["x"] }));
        assert_eq!(fetch.calls(), 1);
        assert_eq!(stub.stored("apps:byId:a").as_deref(), Some(r#"{"v":{"id":"a","tags":["x"]}}"#));
        assert_eq!(stub.stored("lock:apps:byId:a"), None);

        cache.delete_by_prefix("apps:").await;
        assert_eq!(stub.stored("apps:byId:a"), None);

        stub.answer_with(500, r#"{"error":"ERR internal"}"#);
        assert_eq!(fetch.read(&cache, "apps:byId:a").await, json!({ "id": "a", "tags": ["x"] }));
        assert_eq!(metrics.fail_opens(), vec![cache_error()]);
    }
}
