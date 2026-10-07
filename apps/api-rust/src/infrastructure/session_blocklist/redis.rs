use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;

use crate::infrastructure::cache::redis_resilience::{report_fail_open, reporting_breaker};
use crate::infrastructure::cache::{CircuitBreaker, RedisClient, SetOptions};
use crate::use_cases::constants::token_lifetime_s;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::MetricComponent;
use crate::use_cases::ports::{Metrics, SessionBlocklist};

/// How long a revoked session id stays blocklisted: the access token's own
/// lifetime. Past that, every access token the session issued has expired,
/// so the entry has nothing left to block. Keyed by session id rather than
/// per token, so one entry covers all of them.
const TTL: Duration = Duration::from_secs(token_lifetime_s::ACCESS_TOKEN as u64);
const KEY_PREFIX: &str = "revoked-session:";
const COMPONENT: MetricComponent = MetricComponent::SessionBlocklist;
const LOG_LABEL: &str = "session-blocklist";

const REVOKE_FAILED: &str = "[session-blocklist] Redis error while blocklisting a revoked session — its access tokens stay valid until they expire";
const IS_REVOKED_FAILED: &str =
    "[session-blocklist] Redis error in isRevoked — failing open (request allowed)";

/// Redis-backed `SessionBlocklist`, shared across every instance. A
/// per-instance blocklist would be useless here: the instance that handled
/// the logout is very often not the one that handles the next request
/// carrying the revoked token.
///
/// Every call goes through a `CircuitBreaker` and **fails open**: a Redis
/// error, or the breaker already being open, is treated as "not revoked" and
/// the request proceeds. This is a hardening layer that shrinks the
/// revocation window from about 15 minutes to about immediate, so degrading
/// back to the old behaviour during an outage is acceptable, whereas failing
/// closed would unauthenticate the entire API the moment Redis blipped.
///
/// `revoke` failing open is the weaker direction (the revocation silently
/// does not take effect early), so it is logged as an error rather than
/// swallowed. It still must not fail: the database revocation it accompanies
/// has already succeeded and is the source of truth, and the refresh-time
/// check still enforces it within 15 minutes.
pub struct RedisSessionBlocklist {
    redis: Arc<dyn RedisClient>,
    ttl: Duration,
    breaker: CircuitBreaker,
    metrics: Arc<dyn Metrics>,
    logger: Arc<dyn Logger>,
}

impl RedisSessionBlocklist {
    pub fn new(
        redis: Arc<dyn RedisClient>,
        metrics: Arc<dyn Metrics>,
        logger: Arc<dyn Logger>,
    ) -> Self {
        let breaker =
            reporting_breaker(COMPONENT, LOG_LABEL, Arc::clone(&metrics), Arc::clone(&logger));
        Self { redis, ttl: TTL, breaker, metrics, logger }
    }

    pub fn with_ttl(mut self, ttl: Duration) -> Self {
        self.ttl = ttl;
        self
    }

    /// Replaces the default breaker, which is the one that logs and counts
    /// its transitions.
    pub fn with_breaker(mut self, breaker: CircuitBreaker) -> Self {
        self.breaker = breaker;
        self
    }

    fn key(session_id: &str) -> String {
        format!("{KEY_PREFIX}{session_id}")
    }
}

#[async_trait]
impl SessionBlocklist for RedisSessionBlocklist {
    async fn revoke(&self, session_id: &str) {
        let key = Self::key(session_id);
        let marker = json!(1);
        let outcome =
            self.breaker.execute(|| self.redis.set(&key, &marker, SetOptions::px(self.ttl))).await;
        if let Err(err) = outcome {
            report_fail_open(
                self.metrics.as_ref(),
                self.logger.as_ref(),
                COMPONENT,
                &err,
                REVOKE_FAILED,
            );
        }
    }

    async fn is_revoked(&self, session_id: &str) -> bool {
        let key = Self::key(session_id);
        match self.breaker.execute(|| self.redis.get(&key)).await {
            Ok(hit) => hit.is_some(),
            Err(err) => {
                report_fail_open(
                    self.metrics.as_ref(),
                    self.logger.as_ref(),
                    COMPONENT,
                    &err,
                    IS_REVOKED_FAILED,
                );
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::cache::test_support::{FakeRedisClient, StubUpstash};
    use crate::infrastructure::cache::UpstashRedisClient;
    use crate::use_cases::ports::metrics::FailOpenReason;
    use crate::use_cases::test_support::metrics::{CircuitTransitionEvent, FailOpenEvent};
    use crate::use_cases::test_support::{FakeLogger, FakeMetrics, LogLevel};

    struct Harness {
        blocklist: RedisSessionBlocklist,
        redis: Arc<FakeRedisClient>,
        metrics: Arc<FakeMetrics>,
        logger: Arc<FakeLogger>,
    }

    fn harness_on(redis: Arc<FakeRedisClient>) -> Harness {
        let metrics = Arc::new(FakeMetrics::default());
        let logger = Arc::new(FakeLogger::default());
        let blocklist = RedisSessionBlocklist::new(redis.clone(), metrics.clone(), logger.clone());
        Harness { blocklist, redis, metrics, logger }
    }

    fn harness() -> Harness {
        harness_on(Arc::new(FakeRedisClient::default()))
    }

    const fn fail_open(reason: FailOpenReason) -> FailOpenEvent {
        FailOpenEvent { component: MetricComponent::SessionBlocklist, reason }
    }

    #[tokio::test]
    async fn reports_a_revoked_session_as_revoked() {
        let h = harness();

        h.blocklist.revoke("session-1").await;

        assert!(h.blocklist.is_revoked("session-1").await);
        assert_eq!(h.redis.raw_get("revoked-session:session-1").as_deref(), Some("1"));
    }

    #[tokio::test]
    async fn reports_an_unknown_session_as_not_revoked() {
        let h = harness();

        assert!(!h.blocklist.is_revoked("never-seen").await);
        assert!(h.metrics.fail_opens().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn expires_the_entry_after_its_ttl() {
        let h = harness();
        let blocklist = h.blocklist.with_ttl(Duration::from_millis(10));

        blocklist.revoke("session-1").await;
        assert!(blocklist.is_revoked("session-1").await);

        tokio::time::advance(Duration::from_millis(20)).await;

        assert!(!blocklist.is_revoked("session-1").await);
    }

    #[tokio::test(start_paused = true)]
    async fn keeps_an_entry_for_the_access_tokens_lifetime_by_default() {
        let h = harness();

        h.blocklist.revoke("session-1").await;

        tokio::time::advance(Duration::from_secs(15 * 60)).await;
        assert!(h.blocklist.is_revoked("session-1").await);
        tokio::time::advance(Duration::from_millis(1)).await;
        assert!(!h.blocklist.is_revoked("session-1").await);
    }

    #[tokio::test]
    async fn is_coherent_across_two_instances_sharing_one_store() {
        let redis = Arc::new(FakeRedisClient::default());
        let a = harness_on(redis.clone());
        let b = harness_on(redis);

        // A logout handled by one instance must be visible to the instance
        // that serves the next request.
        a.blocklist.revoke("shared-session").await;

        assert!(b.blocklist.is_revoked("shared-session").await);
    }

    #[tokio::test]
    async fn fails_open_on_is_revoked_so_an_outage_does_not_unauthenticate_every_request() {
        let h = harness();
        h.blocklist.revoke("session-1").await;
        assert!(h.blocklist.is_revoked("session-1").await);

        h.redis.set_failing(true);

        assert!(!h.blocklist.is_revoked("session-1").await);
        assert_eq!(h.metrics.fail_opens(), vec![fail_open(FailOpenReason::Error)]);
        let lines = h.logger.lines();
        assert_eq!(lines[0].level, LogLevel::Error);
        assert_eq!(lines[0].message, IS_REVOKED_FAILED);
    }

    #[tokio::test]
    async fn revoke_does_not_fail_when_redis_is_down_and_says_so() {
        let h = harness_on(Arc::new(FakeRedisClient::broken()));

        h.blocklist.revoke("session-1").await;

        assert_eq!(h.metrics.fail_opens(), vec![fail_open(FailOpenReason::Error)]);
        let lines = h.logger.lines();
        assert_eq!(lines[0].level, LogLevel::Error);
        assert_eq!(lines[0].message, REVOKE_FAILED);
        assert!(lines[0].error.is_some());
    }

    #[tokio::test]
    async fn fails_open_without_calling_redis_once_the_circuit_breaker_is_open() {
        let h = harness();
        let blocklist = h.blocklist.with_breaker(CircuitBreaker::new(1, Duration::from_secs(60)));
        h.redis.set_failing(true);
        assert!(!blocklist.is_revoked("session-1").await); // trips the breaker

        h.redis.set_failing(false);
        h.redis.clear_calls();

        assert!(!blocklist.is_revoked("session-1").await);
        blocklist.revoke("session-1").await;
        assert!(h.redis.calls().is_empty());
        assert_eq!(
            h.metrics.fail_opens(),
            vec![
                fail_open(FailOpenReason::Error),
                fail_open(FailOpenReason::CircuitOpen),
                fail_open(FailOpenReason::CircuitOpen),
            ]
        );
        assert_eq!(h.logger.lines().len(), 1);
    }

    #[tokio::test]
    async fn the_default_breaker_logs_and_counts_its_transition() {
        let h = harness_on(Arc::new(FakeRedisClient::broken()));

        for index in 0..10 {
            h.blocklist.is_revoked(&format!("session-{index}")).await;
        }

        assert_eq!(
            h.metrics.circuit_transitions(),
            vec![CircuitTransitionEvent {
                component: MetricComponent::SessionBlocklist,
                from: "closed".to_string(),
                to: "open".to_string(),
            }]
        );
        assert!(
            h.logger
                .lines()
                .iter()
                .any(|line| line.message
                    == "[session-blocklist] Redis circuit breaker closed -> open")
        );
    }

    #[tokio::test]
    async fn works_end_to_end_over_the_rest_client() {
        let stub = StubUpstash::start().await;
        let redis = Arc::new(UpstashRedisClient::new(&stub.url(), "token").unwrap());
        let metrics = Arc::new(FakeMetrics::default());
        let blocklist =
            RedisSessionBlocklist::new(redis, metrics.clone(), Arc::new(FakeLogger::default()));

        assert!(!blocklist.is_revoked("sid-1").await);
        blocklist.revoke("sid-1").await;
        assert!(blocklist.is_revoked("sid-1").await);
        assert_eq!(
            stub.requests()[1].command,
            json!(["set", "revoked-session:sid-1", 1, "px", 900_000])
        );

        stub.answer_with(500, r#"{"error":"ERR internal"}"#);
        assert!(!blocklist.is_revoked("sid-1").await);
        assert_eq!(metrics.fail_opens(), vec![fail_open(FailOpenReason::Error)]);
    }
}
