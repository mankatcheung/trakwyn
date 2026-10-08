use std::sync::Arc;

use async_trait::async_trait;

use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::RateLimitSubject;
use crate::use_cases::ports::{Metrics, RateLimiter};

/// The `event` a rejection is logged under. A stable dotted identifier
/// rather than the wording of the message, so a monitor can key on it.
const RATE_LIMITED_EVENT: &str = "security.rate_limited";
const MESSAGE: &str = "Rate limit exceeded";
const UNKNOWN_ROUTE: &str = "unknown";

/// The subject categories a key may name. Anything else is reported as `Unknown`.
fn subject_of(segment: &str) -> Option<RateLimitSubject> {
    match segment {
        "user" => Some(RateLimitSubject::User),
        "ip" => Some(RateLimitSubject::Ip),
        "email" => Some(RateLimitSubject::Email),
        _ => None,
    }
}

/// A route segment is a literal in the calling use case; this proves it.
fn is_route(segment: &str) -> bool {
    !segment.is_empty()
        && segment.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Splits a bucket key into the two things that are safe to log.
///
/// Keys are `<route>:<subject>:<value>`: `totp:ip:203.0.113.4`,
/// `resume:user:V1Sd…`. Only segments matching a known category are reported,
/// and the route only if it looks like the hard-coded literal it is supposed
/// to be, so **no part of the value can reach a log or a metric attribute**
/// however a future key is spelled. That matters more than completeness: the
/// value is an email address or an IP, and a category of `unknown` is a
/// missing dimension where a leaked value would be an incident.
pub fn describe_rate_limit_key(key: &str) -> (String, RateLimitSubject) {
    let mut segments = key.split(':');
    let route = segments.next().filter(|first| is_route(first)).unwrap_or(UNKNOWN_ROUTE);
    let subject = segments.find_map(subject_of).unwrap_or(RateLimitSubject::Unknown);
    (route.to_string(), subject)
}

/// Logs and counts every rate-limit rejection.
///
/// A decorator at the `RateLimiter` boundary rather than a line in each use
/// case that consumes one: it covers both implementations and every call site
/// by construction, so a new rate-limited route is observable without anyone
/// remembering to make it so.
///
/// Only rejections are recorded. An allowed request is the overwhelming
/// majority and says nothing; the rejection is the security event.
pub struct InstrumentedRateLimiter {
    inner: Arc<dyn RateLimiter>,
    name: &'static str,
    logger: Arc<dyn Logger>,
    metrics: Arc<dyn Metrics>,
}

impl InstrumentedRateLimiter {
    /// `name` identifies the limiter in the log line, e.g. `totpRateLimiter`.
    /// Always a literal, and the name `apps/api` registers the limiter under,
    /// so one query covers both implementations.
    pub fn new(
        inner: Arc<dyn RateLimiter>,
        name: &'static str,
        logger: Arc<dyn Logger>,
        metrics: Arc<dyn Metrics>,
    ) -> Self {
        Self { inner, name, logger, metrics }
    }
}

#[async_trait]
impl RateLimiter for InstrumentedRateLimiter {
    async fn consume(&self, key: &str) -> bool {
        if self.inner.consume(key).await {
            return true;
        }

        let (route, subject) = describe_rate_limit_key(key);
        // No error: nothing failed. The limiter refused on purpose, and the
        // facts are all in the fields.
        self.logger.warn(
            MESSAGE,
            None,
            &[
                ("event", RATE_LIMITED_EVENT.into()),
                ("limiter", self.name.into()),
                ("route", route.as_str().into()),
                ("subject", subject.as_str().into()),
            ],
        );
        self.metrics.record_rate_limited(&route, subject);
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::ports::logger::LogValue;
    use crate::use_cases::test_support::metrics::RateLimitedEvent;
    use crate::use_cases::test_support::{FakeLogger, FakeMetrics, LogLevel, LoggedLine};

    struct Fixed(bool);

    #[async_trait]
    impl RateLimiter for Fixed {
        async fn consume(&self, _key: &str) -> bool {
            self.0
        }
    }

    struct Harness {
        limiter: InstrumentedRateLimiter,
        logger: Arc<FakeLogger>,
        metrics: Arc<FakeMetrics>,
    }

    fn build(allowed: bool, name: &'static str) -> Harness {
        let logger = Arc::new(FakeLogger::default());
        let metrics = Arc::new(FakeMetrics::default());
        let limiter = InstrumentedRateLimiter::new(
            Arc::new(Fixed(allowed)),
            name,
            logger.clone(),
            metrics.clone(),
        );
        Harness { limiter, logger, metrics }
    }

    /// Everything the decorator logged, so a leak shows up as a failing assertion.
    fn logged(line: &LoggedLine) -> String {
        format!("{line:?}")
    }

    #[test]
    fn reads_the_route_and_subject_out_of_a_key() {
        let cases = [
            ("totp:ip:203.0.113.4", "totp", RateLimitSubject::Ip),
            ("totp:email:someone@example.com", "totp", RateLimitSubject::Email),
            ("totp:stepup:user:V1StGXR8", "totp", RateLimitSubject::User),
            ("resume:user:V1StGXR8", "resume", RateLimitSubject::User),
            ("chat:user:V1StGXR8", "chat", RateLimitSubject::User),
            ("test-llm-api-key:user:V1StGXR8", "test-llm-api-key", RateLimitSubject::User),
            ("mcp-oauth:ip:203.0.113.4:some-client", "mcp-oauth", RateLimitSubject::Ip),
        ];
        for (key, route, subject) in cases {
            assert_eq!(describe_rate_limit_key(key), (route.to_string(), subject), "{key}");
        }
    }

    #[test]
    fn reports_an_unrecognised_subject_as_unknown_rather_than_guessing() {
        assert_eq!(
            describe_rate_limit_key("chat:V1StGXR8"),
            ("chat".to_string(), RateLimitSubject::Unknown)
        );
    }

    /// The guard that matters: a key whose first segment is not the
    /// hard-coded literal it is supposed to be must not put that segment in a
    /// log line or a metric attribute.
    #[test]
    fn refuses_to_treat_anything_but_a_literal_as_a_route() {
        for key in [
            "Mozilla/5.0 (Macintosh):ip:203.0.113.4",
            "203.0.113.4:user:V1StGXR8",
            "someone@example.com",
            "",
            ":user:V1StGXR8",
        ] {
            assert_eq!(describe_rate_limit_key(key).0, "unknown", "{key}");
        }
    }

    #[tokio::test]
    async fn passes_an_allowed_request_through_and_records_nothing() {
        let h = build(true, "totpRateLimiter");

        assert!(h.limiter.consume("totp:ip:203.0.113.4").await);

        assert!(h.logger.lines().is_empty());
        assert!(h.metrics.rate_limited().is_empty());
    }

    #[tokio::test]
    async fn logs_and_counts_a_rejection_and_still_rejects() {
        let h = build(false, "totpRateLimiter");

        assert!(!h.limiter.consume("totp:ip:203.0.113.4").await);

        let lines = h.logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].message, "Rate limit exceeded");
        assert_eq!(lines[0].error, None);
        assert_eq!(
            lines[0].fields,
            vec![
                ("event", LogValue::Str("security.rate_limited".to_string())),
                ("limiter", LogValue::Str("totpRateLimiter".to_string())),
                ("route", LogValue::Str("totp".to_string())),
                ("subject", LogValue::Str("ip".to_string())),
            ]
        );
        assert_eq!(
            h.metrics.rate_limited(),
            vec![RateLimitedEvent { route: "totp".to_string(), subject: RateLimitSubject::Ip }]
        );
    }

    /// The whole point of logging the *category*: an operator needs to know
    /// an IP was limited on `totp` without the address itself being logged.
    #[tokio::test]
    async fn keeps_the_subject_value_out_of_the_log_line() {
        let cases = [
            ("totp:ip:203.0.113.4", "203.0.113.4"),
            ("password-reset:email:someone@example.com", "someone@example.com"),
            ("resume:user:V1StGXR8_secret", "V1StGXR8_secret"),
        ];
        for (key, value) in cases {
            let h = build(false, "totpRateLimiter");

            h.limiter.consume(key).await;

            assert!(!logged(&h.logger.lines()[0]).contains(value), "{key}");
        }
    }

    #[tokio::test]
    async fn names_the_limiter_it_decorates_so_two_routes_sharing_one_are_distinguishable() {
        let h = build(false, "mcpOAuthAuthorizationRateLimiter");

        h.limiter.consume("mcp-oauth:ip:203.0.113.4:some-client-id").await;

        let line = &h.logger.lines()[0];
        assert_eq!(
            line.field("limiter"),
            Some(&LogValue::Str("mcpOAuthAuthorizationRateLimiter".to_string()))
        );
        assert_eq!(line.field("route"), Some(&LogValue::Str("mcp-oauth".to_string())));
        assert_eq!(line.field("subject"), Some(&LogValue::Str("ip".to_string())));
        assert_eq!(
            h.metrics.rate_limited(),
            vec![RateLimitedEvent {
                route: "mcp-oauth".to_string(),
                subject: RateLimitSubject::Ip
            }]
        );
    }

    #[tokio::test]
    async fn never_lets_the_client_id_in_an_mcp_oauth_key_reach_the_log() {
        let h = build(false, "mcpOAuthAuthorizationRateLimiter");

        h.limiter.consume("mcp-oauth:ip:203.0.113.4:https://evil.example.com/cb").await;

        assert!(!logged(&h.logger.lines()[0]).contains("evil.example.com"));
    }
}
