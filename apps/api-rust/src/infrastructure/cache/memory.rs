use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::watch;
use tokio::time::Instant;

use super::constants::{DEFAULT_TTL, MEMORY_MAX_ENTRIES};
use super::insertion_ordered::InsertionOrdered;
use super::{Cache, JsonFetch};
use crate::use_cases::errors::{DomainError, DomainResult, ErrorCode, LlmProviderFailure};

struct Entry {
    value: Value,
    expires_at: Instant,
}

/// A fetch failure in a form every caller waiting on the same fetch can be
/// given. A coded error is repeated as it is; an internal one is carried as
/// its text, which still never reaches a client.
#[derive(Clone)]
enum SharedFailure {
    Coded { code: ErrorCode, message: String, llm_provider: Option<LlmProviderFailure> },
    Internal(String),
}

impl SharedFailure {
    fn of(err: &DomainError) -> Self {
        match err {
            DomainError::Coded { code, message, llm_provider } => Self::Coded {
                code: *code,
                message: message.clone(),
                llm_provider: llm_provider.clone(),
            },
            DomainError::Internal(source) => Self::Internal(source.to_string()),
        }
    }

    fn into_error(self) -> DomainError {
        match self {
            Self::Coded { code, message, llm_provider } => {
                DomainError::Coded { code, message, llm_provider }
            }
            Self::Internal(text) => DomainError::internal(text),
        }
    }
}

/// What the caller running a fetch publishes to those waiting on it. `None`
/// until the fetch settles.
type Flight = Option<Result<Value, SharedFailure>>;

struct State {
    /// Oldest first, where a hit counts as a fresh insert: least recently
    /// used at the front.
    store: InsertionOrdered<String, Entry>,
    /// Single-flight: concurrent reads of the same key on a miss share one
    /// in-flight fetch instead of each reaching the database. The in-process
    /// analogue of `RedisCache`'s distributed lock.
    in_flight: HashMap<String, watch::Receiver<Flight>>,
}

/// Per-process, in-memory implementation of `Cache`. Used for local dev and
/// tests. Not coherent across processes or instances: that is what
/// `RedisCache` is for in production.
pub struct MemoryCache {
    state: Mutex<State>,
    ttl: Duration,
    max_entries: usize,
}

impl Default for MemoryCache {
    fn default() -> Self {
        Self::new(DEFAULT_TTL, MEMORY_MAX_ENTRIES)
    }
}

enum Role {
    Hit(Value),
    Leader(watch::Sender<Flight>),
    Waiter(watch::Receiver<Flight>),
}

/// Held by the caller running a fetch. Dropping it, on any path including
/// the caller being cancelled mid-fetch, forgets the in-flight entry first
/// and then closes the channel, so a waiter woken by the closure finds the
/// key free and fetches for itself.
struct FlightGuard<'a> {
    cache: &'a MemoryCache,
    key: &'a str,
    publish: watch::Sender<Flight>,
}

impl Drop for FlightGuard<'_> {
    fn drop(&mut self) {
        self.cache.lock().in_flight.remove(self.key);
    }
}

impl MemoryCache {
    /// A cap below one entry is raised to one.
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self {
            state: Mutex::new(State { store: InsertionOrdered::new(), in_flight: HashMap::new() }),
            ttl,
            max_entries: max_entries.max(1),
        }
    }

    /// Not part of `Cache`: Redis has no cheap equivalent.
    pub fn clear(&self) {
        self.lock().store.clear();
    }

    /// Not part of `Cache`: Redis has no cheap equivalent.
    pub fn len(&self) -> usize {
        self.lock().store.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        // The lock is never held across an await, and a panic while it was
        // held leaves a map that is still a valid map.
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// A live entry is a hit. Otherwise this caller either joins the fetch
    /// already running for the key or becomes the one that runs it.
    fn enter(&self, key: &str) -> Role {
        let mut state = self.lock();
        let owned = key.to_string();

        if let Some(entry) = state.store.get(&owned) {
            if Instant::now() <= entry.expires_at {
                let value = entry.value.clone();
                // LRU touch: this key becomes the last candidate for eviction.
                state.store.move_to_back(&owned);
                return Role::Hit(value);
            }
            state.store.remove(&owned);
        }

        if let Some(waiting) = state.in_flight.get(&owned) {
            return Role::Waiter(waiting.clone());
        }
        let (publish, subscribe) = watch::channel(None);
        state.in_flight.insert(owned, subscribe);
        Role::Leader(publish)
    }

    fn store(&self, key: &str, value: Value, ttl: Duration) {
        let mut state = self.lock();
        state.store.insert(key.to_string(), Entry { value, expires_at: Instant::now() + ttl });
        while state.store.len() > self.max_entries {
            if state.store.remove_oldest().is_none() {
                break;
            }
        }
    }
}

#[async_trait]
impl Cache for MemoryCache {
    async fn get_or_set_json(
        &self,
        key: &str,
        fetch: JsonFetch<'_, '_>,
        ttl: Option<Duration>,
    ) -> DomainResult<Value> {
        let ttl = ttl.unwrap_or(self.ttl);
        loop {
            match self.enter(key) {
                Role::Hit(value) => return Ok(value),
                Role::Waiter(mut flight) => {
                    let settled = match flight.wait_for(Option::is_some).await {
                        Ok(settled) => settled.clone(),
                        // The caller running the fetch went away before it
                        // settled. Start over: the key is free again.
                        Err(_) => continue,
                    };
                    if let Some(outcome) = settled {
                        return outcome.map_err(SharedFailure::into_error);
                    }
                }
                Role::Leader(publish) => {
                    let guard = FlightGuard { cache: self, key, publish };
                    let outcome = fetch().await;
                    let shared = match &outcome {
                        Ok(value) => {
                            self.store(key, value.clone(), ttl);
                            Ok(value.clone())
                        }
                        Err(err) => Err(SharedFailure::of(err)),
                    };
                    // No receiver left just means nobody was waiting.
                    let _ = guard.publish.send(Some(shared));
                    return outcome;
                }
            }
        }
    }

    async fn delete(&self, key: &str) {
        self.lock().store.remove(&key.to_string());
    }

    async fn delete_by_prefix(&self, prefix: &str) {
        let mut state = self.lock();
        let matching: Vec<String> =
            state.store.keys().filter(|key| key.starts_with(prefix)).cloned().collect();
        for key in matching {
            state.store.remove(&key);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use serde_json::json;
    use tokio::sync::Notify;

    use super::super::CacheExt;
    use super::*;

    /// A fetch that counts its calls and returns a fixed value.
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

        async fn read(&self, cache: &MemoryCache, key: &str) -> Value {
            cache
                .get_or_set(
                    key,
                    || async {
                        self.calls.fetch_add(1, Ordering::SeqCst);
                        Ok(self.value.clone())
                    },
                    None,
                )
                .await
                .unwrap()
        }
    }

    fn one_second_cache(max_entries: usize) -> MemoryCache {
        MemoryCache::new(Duration::from_millis(1000), max_entries)
    }

    async fn advance(ms: u64) {
        tokio::time::advance(Duration::from_millis(ms)).await;
    }

    #[tokio::test]
    async fn calls_fetch_and_caches_the_result_on_a_miss() {
        let cache = one_second_cache(100);
        let fetch = Counted::new(json!("value"));

        assert_eq!(fetch.read(&cache, "key").await, json!("value"));
        assert_eq!(fetch.calls(), 1);
    }

    #[tokio::test]
    async fn returns_the_cached_value_on_a_second_call_without_fetching_again() {
        let cache = one_second_cache(100);
        let fetch = Counted::new(json!("value"));

        fetch.read(&cache, "key").await;
        assert_eq!(fetch.read(&cache, "key").await, json!("value"));
        assert_eq!(fetch.calls(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn calls_fetch_again_after_the_ttl_expires() {
        let cache = one_second_cache(100);
        let fetch = Counted::new(json!("value"));

        fetch.read(&cache, "key").await;
        advance(1001).await;
        fetch.read(&cache, "key").await;

        assert_eq!(fetch.calls(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn does_not_call_fetch_again_before_the_ttl_expires() {
        let cache = one_second_cache(100);
        let fetch = Counted::new(json!("value"));

        fetch.read(&cache, "key").await;
        advance(1000).await; // the boundary itself is still a hit
        fetch.read(&cache, "key").await;

        assert_eq!(fetch.calls(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn honours_a_ttl_given_for_one_read() {
        let cache = one_second_cache(100);
        let calls = AtomicUsize::new(0);
        let fetch = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(1)
        };

        cache.get_or_set("key", fetch, Some(Duration::from_millis(10))).await.unwrap();
        advance(11).await;
        cache.get_or_set("key", fetch, Some(Duration::from_millis(10))).await.unwrap();

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn deletes_a_specific_key() {
        let cache = one_second_cache(100);
        let fetch_a = Counted::new(json!(1));
        let fetch_b = Counted::new(json!(2));
        fetch_a.read(&cache, "a").await;
        fetch_b.read(&cache, "b").await;

        cache.delete("a").await;

        fetch_a.read(&cache, "a").await;
        fetch_b.read(&cache, "b").await;
        assert_eq!(fetch_a.calls(), 2);
        assert_eq!(fetch_b.calls(), 1);
    }

    #[tokio::test]
    async fn deletes_all_keys_matching_a_prefix() {
        let cache = one_second_cache(100);
        let user1 = Counted::new(json!("list1"));
        let user2 = Counted::new(json!("list2"));
        let by_id = Counted::new(json!("single"));
        user1.read(&cache, "apps:list:user1:").await;
        user2.read(&cache, "apps:list:user2:").await;
        by_id.read(&cache, "apps:byId:abc").await;

        cache.delete_by_prefix("apps:list:user1:").await;

        user1.read(&cache, "apps:list:user1:").await;
        user2.read(&cache, "apps:list:user2:").await;
        by_id.read(&cache, "apps:byId:abc").await;
        assert_eq!(user1.calls(), 2);
        assert_eq!(user2.calls(), 1);
        assert_eq!(by_id.calls(), 1);
    }

    #[tokio::test]
    async fn caches_a_null_result_as_a_valid_value_distinct_from_a_miss() {
        let cache = one_second_cache(100);
        let fetch = Counted::new(Value::Null);

        assert_eq!(fetch.read(&cache, "nullable").await, Value::Null);
        assert_eq!(fetch.read(&cache, "nullable").await, Value::Null);
        assert_eq!(fetch.calls(), 1);
    }

    #[tokio::test]
    async fn single_flight_concurrent_misses_for_one_key_fetch_once() {
        let cache = Arc::new(one_second_cache(100));
        let calls = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(Notify::new());

        let read = |cache: Arc<MemoryCache>, calls: Arc<AtomicUsize>, release: Arc<Notify>| {
            tokio::spawn(async move {
                cache
                    .get_or_set(
                        "key",
                        || async {
                            calls.fetch_add(1, Ordering::SeqCst);
                            release.notified().await;
                            Ok("value".to_string())
                        },
                        None,
                    )
                    .await
            })
        };

        let first = read(Arc::clone(&cache), Arc::clone(&calls), Arc::clone(&release));
        let second = read(Arc::clone(&cache), Arc::clone(&calls), Arc::clone(&release));
        // Let both reach the cache before the fetch is allowed to finish.
        tokio::time::sleep(Duration::from_millis(20)).await;
        release.notify_one();

        assert_eq!(first.await.unwrap().unwrap(), "value");
        assert_eq!(second.await.unwrap().unwrap(), "value");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn single_flight_shares_a_failure_and_caches_nothing() {
        let cache = Arc::new(one_second_cache(100));
        let release = Arc::new(Notify::new());

        let read = |cache: Arc<MemoryCache>, release: Arc<Notify>| {
            tokio::spawn(async move {
                cache
                    .get_or_set(
                        "key",
                        || async {
                            release.notified().await;
                            Err::<String, _>(DomainError::not_found("Skill"))
                        },
                        None,
                    )
                    .await
            })
        };

        let first = read(Arc::clone(&cache), Arc::clone(&release));
        let second = read(Arc::clone(&cache), Arc::clone(&release));
        tokio::time::sleep(Duration::from_millis(20)).await;
        release.notify_one();

        for outcome in [first.await.unwrap(), second.await.unwrap()] {
            let err = outcome.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "Skill not found");
        }
        assert!(cache.is_empty());
        assert!(cache.lock().in_flight.is_empty());
    }

    #[tokio::test]
    async fn a_waiter_fetches_for_itself_when_the_fetching_caller_is_cancelled() {
        let cache = Arc::new(one_second_cache(100));

        let stuck = {
            let cache = Arc::clone(&cache);
            tokio::spawn(async move {
                cache
                    .get_or_set(
                        "key",
                        || async {
                            std::future::pending::<()>().await;
                            Ok("never".to_string())
                        },
                        None,
                    )
                    .await
            })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;

        let waiter = {
            let cache = Arc::clone(&cache);
            tokio::spawn(async move {
                cache.get_or_set("key", || async { Ok("mine".to_string()) }, None).await
            })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;
        stuck.abort();

        assert_eq!(waiter.await.unwrap().unwrap(), "mine");
    }

    #[tokio::test]
    async fn clears_all_entries() {
        let cache = one_second_cache(100);
        Counted::new(json!(1)).read(&cache, "a").await;
        Counted::new(json!(2)).read(&cache, "b").await;

        cache.clear();

        assert_eq!(cache.len(), 0);
    }

    #[tokio::test]
    async fn reports_the_correct_size() {
        let cache = one_second_cache(100);
        assert_eq!(cache.len(), 0);
        Counted::new(json!(1)).read(&cache, "a").await;
        Counted::new(json!(2)).read(&cache, "b").await;
        assert_eq!(cache.len(), 2);
    }

    #[tokio::test]
    async fn evicts_the_least_recently_used_entry_when_exceeding_the_cap() {
        let cache = one_second_cache(2);
        Counted::new(json!(1)).read(&cache, "a").await;
        Counted::new(json!(2)).read(&cache, "b").await;
        Counted::new(json!(3)).read(&cache, "c").await;

        assert_eq!(cache.len(), 2);
        let refetch_a = Counted::new(json!("a-refetched"));
        refetch_a.read(&cache, "a").await;
        assert_eq!(refetch_a.calls(), 1);
    }

    #[tokio::test]
    async fn a_hit_refreshes_recency_so_the_entry_is_not_the_first_evicted() {
        let cache = one_second_cache(2);
        Counted::new(json!(1)).read(&cache, "a").await;
        Counted::new(json!(2)).read(&cache, "b").await;
        // A hit on 'a' (its fetch is not called) makes 'b' the LRU entry.
        let hit = Counted::new(json!("unused"));
        hit.read(&cache, "a").await;
        Counted::new(json!(3)).read(&cache, "c").await; // evicts 'b', keeps 'a'

        let fetch_a = Counted::new(json!("a"));
        let fetch_b = Counted::new(json!("b"));
        fetch_a.read(&cache, "a").await;
        fetch_b.read(&cache, "b").await;
        assert_eq!(hit.calls(), 0);
        assert_eq!(fetch_a.calls(), 0);
        assert_eq!(fetch_b.calls(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn evicts_an_expired_oldest_entry_when_over_the_cap() {
        let cache = one_second_cache(2);
        Counted::new(json!(1)).read(&cache, "a").await;
        advance(600).await;
        Counted::new(json!(2)).read(&cache, "b").await;
        advance(600).await; // 'a' has expired, 'b' has not
        Counted::new(json!(3)).read(&cache, "c").await; // over the cap: evicts 'a'

        assert_eq!(cache.len(), 2);
        let fetch_b = Counted::new(json!(2));
        let fetch_c = Counted::new(json!(3));
        let fetch_a = Counted::new(json!(1));
        fetch_b.read(&cache, "b").await;
        fetch_c.read(&cache, "c").await;
        fetch_a.read(&cache, "a").await;
        assert_eq!(fetch_b.calls(), 0);
        assert_eq!(fetch_c.calls(), 0);
        assert_eq!(fetch_a.calls(), 1);
    }

    #[tokio::test]
    async fn raises_a_cap_below_one_to_one() {
        let cache = MemoryCache::new(Duration::from_secs(1), 0);
        Counted::new(json!(1)).read(&cache, "a").await;
        Counted::new(json!(2)).read(&cache, "b").await;
        assert_eq!(cache.len(), 1);
    }
}
