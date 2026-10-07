use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use tokio::time::Instant;

use crate::use_cases::ports::{RateLimit, RateLimiter};

struct Bucket {
    count: u32,
    reset_at: Instant,
}

/// In-process, fixed-window rate limiter. Buckets live in memory and are
/// never persisted, so limits reset on process restart and are not shared
/// across horizontally scaled instances: used for local dev and tests only.
/// Production uses `RedisRateLimiter`, selected by the same `CACHE_PROVIDER`
/// toggle `RedisCache` uses.
pub struct MemoryRateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    limit: RateLimit,
}

impl MemoryRateLimiter {
    pub fn new(limit: RateLimit) -> Self {
        Self { buckets: Mutex::new(HashMap::new()), limit }
    }
}

#[async_trait]
impl RateLimiter for MemoryRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        let now = Instant::now();
        // A poisoned lock leaves a map that is still a valid map.
        let mut buckets = self.buckets.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        match buckets.get_mut(key) {
            Some(bucket) if now <= bucket.reset_at => {
                if bucket.count >= self.limit.max_attempts {
                    return false;
                }
                bucket.count += 1;
                true
            }
            _ => {
                let bucket = Bucket { count: 1, reset_at: now + self.limit.window };
                buckets.insert(key.to_string(), bucket);
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn limiter(max_attempts: u32) -> MemoryRateLimiter {
        MemoryRateLimiter::new(RateLimit::new(max_attempts, 60_000))
    }

    #[tokio::test(start_paused = true)]
    async fn allows_requests_up_to_the_configured_maximum_within_the_window() {
        let limiter = limiter(3);

        assert!(limiter.consume("key-1").await);
        assert!(limiter.consume("key-1").await);
        assert!(limiter.consume("key-1").await);
    }

    #[tokio::test(start_paused = true)]
    async fn rejects_requests_once_the_maximum_is_exceeded_within_the_window() {
        let limiter = limiter(2);

        assert!(limiter.consume("key-1").await);
        assert!(limiter.consume("key-1").await);
        assert!(!limiter.consume("key-1").await);
    }

    #[tokio::test(start_paused = true)]
    async fn tracks_separate_keys_independently() {
        let limiter = limiter(1);

        assert!(limiter.consume("key-1").await);
        assert!(limiter.consume("key-2").await);
        assert!(!limiter.consume("key-1").await);
        assert!(!limiter.consume("key-2").await);
    }

    #[tokio::test(start_paused = true)]
    async fn resets_the_count_once_the_window_has_elapsed() {
        let limiter = limiter(1);

        assert!(limiter.consume("key-1").await);
        assert!(!limiter.consume("key-1").await);

        // The window's last millisecond still belongs to it.
        tokio::time::advance(Duration::from_millis(60_000)).await;
        assert!(!limiter.consume("key-1").await);

        tokio::time::advance(Duration::from_millis(1)).await;
        assert!(limiter.consume("key-1").await);
    }
}
