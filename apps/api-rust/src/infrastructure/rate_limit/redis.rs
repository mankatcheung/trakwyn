use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use crate::infrastructure::cache::redis_resilience::{report_fail_open, reporting_breaker};
use crate::infrastructure::cache::{CircuitBreaker, RedisClient, RedisError, SetOptions};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::MetricComponent;
use crate::use_cases::ports::{Metrics, RateLimit, RateLimiter};

const KEY_PREFIX: &str = "ratelimit:";
const COMPONENT: MetricComponent = MetricComponent::RateLimit;
const LOG_LABEL: &str = "rate-limit";
const CONSUME_FAILED: &str = "[rate-limit] Redis error in consume — failing open (request allowed)";

/// Redis-backed `RateLimiter`, shared across every instance. The in-memory
/// limiter's buckets reset per instance and per cold start, so under normal
/// horizontal scaling its effective limit becomes `max_attempts × (warm
/// instance count)`: a rate limit that does not actually limit anything.
///
/// Unlike `RedisCache`'s stampede lock there is nothing extra to coordinate
/// here: `INCR` is atomic on its own, so a single command gives correct
/// cross-instance counting.
///
/// On any Redis failure (a genuine error, or the circuit already open) this
/// fails OPEN, allowing the request, rather than closed. A rate limiter that
/// occasionally under-limits during a rare Redis outage is far preferable to
/// one that locks every user out of login, password reset and chat because
/// Redis had a blip.
pub struct RedisRateLimiter {
    redis: Arc<dyn RedisClient>,
    limit: RateLimit,
    breaker: CircuitBreaker,
    metrics: Arc<dyn Metrics>,
    logger: Arc<dyn Logger>,
}

impl RedisRateLimiter {
    pub fn new(
        redis: Arc<dyn RedisClient>,
        limit: RateLimit,
        metrics: Arc<dyn Metrics>,
        logger: Arc<dyn Logger>,
    ) -> Self {
        let breaker =
            reporting_breaker(COMPONENT, LOG_LABEL, Arc::clone(&metrics), Arc::clone(&logger));
        Self { redis, limit, breaker, metrics, logger }
    }

    /// Replaces the default breaker, which is the one that logs and counts
    /// its transitions.
    pub fn with_breaker(mut self, breaker: CircuitBreaker) -> Self {
        self.breaker = breaker;
        self
    }

    async fn increment(&self, key: &str) -> Result<i64, RedisError> {
        let redis_key = format!("{KEY_PREFIX}{key}");
        // Atomically create the key with its window TTL baked in (`SET NX
        // PX`). That avoids the classic "INCR then conditionally PEXPIRE"
        // race, where a crash between the two steps leaves a key with no
        // expiry at all, rate-limited for good. Only a plain `INCR` is needed
        // on the much more common path where the key already exists.
        let options = SetOptions::nx_px(self.limit.window);
        if self.redis.set(&redis_key, &json!(1), options).await? {
            return Ok(1);
        }
        self.redis.incr(&redis_key).await
    }
}

#[async_trait]
impl RateLimiter for RedisRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        match self.breaker.execute(|| self.increment(key)).await {
            Ok(count) => count <= i64::from(self.limit.max_attempts),
            Err(err) => {
                report_fail_open(
                    self.metrics.as_ref(),
                    self.logger.as_ref(),
                    COMPONENT,
                    &err,
                    CONSUME_FAILED,
                );
                true
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::infrastructure::cache::test_support::{FakeRedisClient, StubUpstash};
    use crate::infrastructure::cache::UpstashRedisClient;
    use crate::use_cases::ports::metrics::FailOpenReason;
    use crate::use_cases::test_support::metrics::{CircuitTransitionEvent, FailOpenEvent};
    use crate::use_cases::test_support::{FakeLogger, FakeMetrics, LogLevel};

    struct Harness {
        limiter: RedisRateLimiter,
        redis: Arc<FakeRedisClient>,
        metrics: Arc<FakeMetrics>,
        logger: Arc<FakeLogger>,
    }

    fn harness_on(redis: Arc<FakeRedisClient>, max_attempts: u32, window_ms: u64) -> Harness {
        let metrics = Arc::new(FakeMetrics::default());
        let logger = Arc::new(FakeLogger::default());
        let limit = RateLimit::new(max_attempts, window_ms);
        let limiter = RedisRateLimiter::new(redis.clone(), limit, metrics.clone(), logger.clone());
        Harness { limiter, redis, metrics, logger }
    }

    fn harness(max_attempts: u32, window_ms: u64) -> Harness {
        harness_on(Arc::new(FakeRedisClient::default()), max_attempts, window_ms)
    }

    const fn fail_open(reason: FailOpenReason) -> FailOpenEvent {
        FailOpenEvent { component: MetricComponent::RateLimit, reason }
    }

    #[tokio::test]
    async fn allows_requests_up_to_the_configured_maximum_within_the_window() {
        let h = harness(3, 60_000);

        assert!(h.limiter.consume("key-1").await);
        assert!(h.limiter.consume("key-1").await);
        assert!(h.limiter.consume("key-1").await);
    }

    #[tokio::test]
    async fn rejects_requests_once_the_maximum_is_exceeded_within_the_window() {
        let h = harness(2, 60_000);

        assert!(h.limiter.consume("key-1").await);
        assert!(h.limiter.consume("key-1").await);
        assert!(!h.limiter.consume("key-1").await);
        assert!(h.metrics.fail_opens().is_empty());
    }

    #[tokio::test]
    async fn tracks_separate_keys_independently() {
        let h = harness(1, 60_000);

        assert!(h.limiter.consume("key-1").await);
        assert!(h.limiter.consume("key-2").await);
        assert!(!h.limiter.consume("key-1").await);
        assert!(!h.limiter.consume("key-2").await);
    }

    #[tokio::test(start_paused = true)]
    async fn resets_the_count_once_the_window_has_elapsed() {
        let h = harness(1, 10);

        assert!(h.limiter.consume("key-1").await);
        assert!(!h.limiter.consume("key-1").await);

        tokio::time::advance(Duration::from_millis(20)).await;

        assert!(h.limiter.consume("key-1").await);
    }

    #[tokio::test(start_paused = true)]
    async fn creates_the_bucket_under_the_prefix_with_the_window_as_its_ttl() {
        let h = harness(5, 60_000);

        h.limiter.consume("totp:ip:203.0.113.4").await;
        h.limiter.consume("totp:ip:203.0.113.4").await;

        assert_eq!(h.redis.raw_get("ratelimit:totp:ip:203.0.113.4").as_deref(), Some("2"));
        assert_eq!(h.redis.calls(), vec!["set", "set", "incr"]);

        // Counting again does not push the window out.
        tokio::time::advance(Duration::from_millis(60_001)).await;
        assert_eq!(h.redis.raw_get("ratelimit:totp:ip:203.0.113.4"), None);
    }

    #[tokio::test]
    async fn is_coherent_across_two_limiters_sharing_one_store() {
        let redis = Arc::new(FakeRedisClient::default());
        let a = harness_on(redis.clone(), 2, 60_000);
        let b = harness_on(redis, 2, 60_000);

        assert!(a.limiter.consume("shared-key").await);
        assert!(b.limiter.consume("shared-key").await);
        // The third attempt, whichever instance makes it, sees the count at 2.
        assert!(!a.limiter.consume("shared-key").await);
    }

    #[tokio::test]
    async fn fails_open_when_redis_errors_and_records_it() {
        let h = harness_on(Arc::new(FakeRedisClient::broken()), 1, 60_000);

        assert!(h.limiter.consume("key-1").await);
        assert!(h.limiter.consume("key-1").await);

        assert_eq!(h.metrics.fail_opens(), vec![fail_open(FailOpenReason::Error); 2]);
        let lines = h.logger.lines();
        assert_eq!(lines[0].level, LogLevel::Error);
        assert_eq!(lines[0].message, CONSUME_FAILED);
        assert!(lines[0].error.is_some());
    }

    #[tokio::test]
    async fn opens_the_circuit_after_repeated_failures_and_stops_calling_redis_at_all() {
        let h = harness(1, 60_000);
        let limiter = h.limiter.with_breaker(CircuitBreaker::new(1, Duration::from_secs(60)));
        h.redis.set_failing(true);
        limiter.consume("key-1").await; // trips the breaker open

        h.redis.set_failing(false);
        h.redis.clear_calls();

        assert!(limiter.consume("key-1").await); // still fails open
        assert!(h.redis.calls().is_empty());
        // A short-circuited call is told apart from a genuine Redis error.
        assert_eq!(
            h.metrics.fail_opens(),
            vec![fail_open(FailOpenReason::Error), fail_open(FailOpenReason::CircuitOpen)]
        );
        assert_eq!(h.logger.lines().len(), 1);
    }

    #[tokio::test]
    async fn the_default_breaker_logs_and_counts_its_transition() {
        let h = harness_on(Arc::new(FakeRedisClient::broken()), 5, 60_000);

        for index in 0..10 {
            h.limiter.consume(&format!("key-{index}")).await;
        }

        assert_eq!(
            h.metrics.circuit_transitions(),
            vec![CircuitTransitionEvent {
                component: MetricComponent::RateLimit,
                from: "closed".to_string(),
                to: "open".to_string(),
            }]
        );
        assert!(h
            .logger
            .lines()
            .iter()
            .any(|line| line.message == "[rate-limit] Redis circuit breaker closed -> open"));
        // Five genuine errors, then five short-circuits.
        assert_eq!(h.metrics.fail_opens().len(), 10);
        assert_eq!(h.metrics.fail_opens()[5], fail_open(FailOpenReason::CircuitOpen));
    }

    #[tokio::test]
    async fn works_end_to_end_over_the_rest_client() {
        let stub = StubUpstash::start().await;
        let redis = Arc::new(UpstashRedisClient::new(&stub.url(), "token").unwrap());
        let metrics = Arc::new(FakeMetrics::default());
        let limiter = RedisRateLimiter::new(
            redis,
            RateLimit::new(2, 60_000),
            metrics.clone(),
            Arc::new(FakeLogger::default()),
        );

        assert!(limiter.consume("chat:user:u1").await);
        assert!(limiter.consume("chat:user:u1").await);
        assert!(!limiter.consume("chat:user:u1").await);
        assert_eq!(stub.stored("ratelimit:chat:user:u1").as_deref(), Some("3"));
        assert_eq!(
            stub.requests()[0].command,
            json!(["set", "ratelimit:chat:user:u1", 1, "nx", "px", 60_000])
        );

        stub.answer_with(500, r#"{"error":"ERR internal"}"#);
        assert!(limiter.consume("chat:user:u1").await);
        assert_eq!(metrics.fail_opens(), vec![fail_open(FailOpenReason::Error)]);
    }
}
