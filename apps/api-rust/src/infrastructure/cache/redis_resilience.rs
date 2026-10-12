//! What the three Redis-backed stores (cache, rate limiter, session
//! blocklist) share: a breaker that reports its transitions, and one way of
//! recording that a call fell back to its fail-open path.

use std::sync::Arc;

use super::circuit_breaker::{BreakerError, CircuitBreaker};
use super::redis_client::RedisError;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::{FailOpenReason, MetricComponent};
use crate::use_cases::ports::Metrics;

/// A breaker with the default tuning that logs and counts every transition.
/// `label` is the bracketed tag the store's log lines carry (`cache`,
/// `rate-limit`, `session-blocklist`).
pub(crate) fn reporting_breaker(
    component: MetricComponent,
    label: &'static str,
    metrics: Arc<dyn Metrics>,
    logger: Arc<dyn Logger>,
) -> CircuitBreaker {
    CircuitBreaker::default().on_state_change(Box::new(move |from, to| {
        let message =
            format!("[{label}] Redis circuit breaker {} -> {}", from.as_str(), to.as_str());
        logger.warn(&message, None, &[]);
        metrics.record_circuit_transition(component, from.as_str(), to.as_str());
    }))
}

pub(crate) fn fail_open_reason<E>(err: &BreakerError<E>) -> FailOpenReason {
    if err.is_open() {
        FailOpenReason::CircuitOpen
    } else {
        FailOpenReason::Error
    }
}

/// Counts the fail-open, and logs it unless the breaker was already open: an
/// open breaker said so once when it opened, and would otherwise repeat it on
/// every request.
pub(crate) fn report_fail_open(
    metrics: &dyn Metrics,
    logger: &dyn Logger,
    component: MetricComponent,
    err: &BreakerError<RedisError>,
    message: &str,
) {
    metrics.record_fail_open(component, fail_open_reason(err));
    if let BreakerError::Inner(redis_error) = err {
        logger.error(message, Some(redis_error), &[]);
    }
}
