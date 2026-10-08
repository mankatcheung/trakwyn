use crate::use_cases::ports::metrics::{
    DatabasePoolReader, EmailOutcome, EmailTemplate, FailOpenReason, LlmCallMetric,
    LlmTokenDirection, MetricComponent, Metrics, OutboundUrlRefusalReason, PoolAcquirePhase,
    RateLimitSubject,
};
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPurpose;

/// Records nothing. Used in tests and wherever metrics are irrelevant, and
/// in the running server until an exporter is added behind `Metrics`.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoopMetrics;

impl Metrics for NoopMetrics {
    fn record_cache_hit(&self) {}

    fn record_cache_miss(&self) {}

    fn record_fail_open(&self, _component: MetricComponent, _reason: FailOpenReason) {}

    fn record_circuit_transition(&self, _component: MetricComponent, _from: &str, _to: &str) {}

    fn record_database_pool_error(&self) {}

    fn observe_database_pool(&self, _read: DatabasePoolReader) {}

    fn record_database_pool_acquire_timeout(&self, _phase: PoolAcquirePhase) {}

    fn record_rate_limited(&self, _route: &str, _subject: RateLimitSubject) {}

    fn record_outbound_url_refused(
        &self,
        _reason: OutboundUrlRefusalReason,
        _purpose: OutboundUrlPurpose,
    ) {
    }

    fn record_email_sent(&self, _template: EmailTemplate, _outcome: EmailOutcome) {}

    fn record_security_event(&self, _event_type: &str) {}

    fn record_tool_call(&self, _surface: &str, _tool: &str, _outcome: &str) {}

    fn record_mcp_tool_refused(&self, _tool: &str, _scope: &str) {}

    fn record_llm_call(&self, _call: LlmCallMetric) {}

    fn record_llm_tokens(&self, _provider: &str, _direction: LlmTokenDirection, _count: u64) {}
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use super::*;
    use crate::use_cases::ports::metrics::{DatabasePoolState, LlmCallOutcome, LlmOperation};

    #[test]
    fn accepts_every_event_and_never_reads_the_pool() {
        let metrics: Arc<dyn Metrics> = Arc::new(NoopMetrics);
        let read = Arc::new(AtomicBool::new(false));
        let seen = Arc::clone(&read);

        metrics.record_cache_hit();
        metrics.record_cache_miss();
        metrics.record_fail_open(MetricComponent::Cache, FailOpenReason::Error);
        metrics.record_circuit_transition(MetricComponent::Cache, "closed", "open");
        metrics.record_database_pool_error();
        metrics.observe_database_pool(Box::new(move || {
            seen.store(true, Ordering::SeqCst);
            DatabasePoolState { total: 0, idle: 0, waiting: 0 }
        }));
        metrics.record_database_pool_acquire_timeout(PoolAcquirePhase::Connecting);
        metrics.record_rate_limited("totp", RateLimitSubject::Ip);
        metrics.record_outbound_url_refused(
            OutboundUrlRefusalReason::BlockedPort,
            OutboundUrlPurpose::LlmProvider,
        );
        metrics.record_email_sent(EmailTemplate::PasswordReset, EmailOutcome::Sent);
        metrics.record_security_event("password_changed");
        metrics.record_tool_call("chat", "list_applications", "ok");
        metrics.record_mcp_tool_refused("create_note", "read");
        metrics.record_llm_call(LlmCallMetric {
            provider: "openai".to_string(),
            model: Some("gpt".to_string()),
            operation: LlmOperation::Complete,
            outcome: LlmCallOutcome::Success,
            error_kind: None,
            duration_ms: 1.0,
        });
        metrics.record_llm_tokens("openai", LlmTokenDirection::Input, 10);

        assert!(!read.load(Ordering::SeqCst));
    }
}
