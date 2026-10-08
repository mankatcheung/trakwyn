use std::sync::{Mutex, MutexGuard};

use crate::use_cases::ports::metrics::{
    DatabasePoolReader, DatabasePoolState, EmailOutcome, EmailTemplate, FailOpenReason,
    LlmCallMetric, LlmTokenDirection, MetricComponent, Metrics, OutboundUrlRefusalReason,
    PoolAcquirePhase, RateLimitSubject,
};
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPurpose;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FailOpenEvent {
    pub component: MetricComponent,
    pub reason: FailOpenReason,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CircuitTransitionEvent {
    pub component: MetricComponent,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RateLimitedEvent {
    pub route: String,
    pub subject: RateLimitSubject,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboundUrlRefusedEvent {
    pub reason: OutboundUrlRefusalReason,
    pub purpose: OutboundUrlPurpose,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailSentEvent {
    pub template: EmailTemplate,
    pub outcome: EmailOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCallEvent {
    pub surface: String,
    pub tool: String,
    pub outcome: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpToolRefusedEvent {
    pub tool: String,
    pub scope: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmTokensEvent {
    pub provider: String,
    pub direction: LlmTokenDirection,
    pub count: u64,
}

#[derive(Default)]
struct Recorded {
    hits: u64,
    misses: u64,
    fail_opens: Vec<FailOpenEvent>,
    circuit_transitions: Vec<CircuitTransitionEvent>,
    database_pool_errors: u64,
    database_pool_observers: Vec<DatabasePoolReader>,
    database_pool_acquire_timeouts: Vec<PoolAcquirePhase>,
    rate_limited: Vec<RateLimitedEvent>,
    outbound_url_refused: Vec<OutboundUrlRefusedEvent>,
    emails_sent: Vec<EmailSentEvent>,
    security_events: Vec<String>,
    tool_calls: Vec<ToolCallEvent>,
    mcp_tool_refused: Vec<McpToolRefusedEvent>,
    llm_calls: Vec<LlmCallMetric>,
    llm_tokens: Vec<LlmTokensEvent>,
}

/// Recording `Metrics` stand-in: lets tests assert on what was measured
/// without standing up an OpenTelemetry SDK and an in-memory metric reader.
#[derive(Default)]
pub struct FakeMetrics {
    recorded: Mutex<Recorded>,
}

impl FakeMetrics {
    fn recorded(&self) -> MutexGuard<'_, Recorded> {
        self.recorded.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn hits(&self) -> u64 {
        self.recorded().hits
    }

    pub fn misses(&self) -> u64 {
        self.recorded().misses
    }

    pub fn fail_opens(&self) -> Vec<FailOpenEvent> {
        self.recorded().fail_opens.clone()
    }

    pub fn circuit_transitions(&self) -> Vec<CircuitTransitionEvent> {
        self.recorded().circuit_transitions.clone()
    }

    pub fn database_pool_errors(&self) -> u64 {
        self.recorded().database_pool_errors
    }

    /// What each reader handed to `observe_database_pool` reports right now:
    /// what the gauges would export.
    pub fn database_pool_observations(&self) -> Vec<DatabasePoolState> {
        self.recorded().database_pool_observers.iter().map(|read| read()).collect()
    }

    pub fn database_pool_acquire_timeouts(&self) -> Vec<PoolAcquirePhase> {
        self.recorded().database_pool_acquire_timeouts.clone()
    }

    pub fn rate_limited(&self) -> Vec<RateLimitedEvent> {
        self.recorded().rate_limited.clone()
    }

    pub fn outbound_url_refused(&self) -> Vec<OutboundUrlRefusedEvent> {
        self.recorded().outbound_url_refused.clone()
    }

    pub fn emails_sent(&self) -> Vec<EmailSentEvent> {
        self.recorded().emails_sent.clone()
    }

    pub fn security_events(&self) -> Vec<String> {
        self.recorded().security_events.clone()
    }

    pub fn tool_calls(&self) -> Vec<ToolCallEvent> {
        self.recorded().tool_calls.clone()
    }

    pub fn mcp_tool_refused(&self) -> Vec<McpToolRefusedEvent> {
        self.recorded().mcp_tool_refused.clone()
    }

    pub fn llm_calls(&self) -> Vec<LlmCallMetric> {
        self.recorded().llm_calls.clone()
    }

    pub fn llm_tokens(&self) -> Vec<LlmTokensEvent> {
        self.recorded().llm_tokens.clone()
    }
}

impl Metrics for FakeMetrics {
    fn record_cache_hit(&self) {
        self.recorded().hits += 1;
    }

    fn record_cache_miss(&self) {
        self.recorded().misses += 1;
    }

    fn record_fail_open(&self, component: MetricComponent, reason: FailOpenReason) {
        self.recorded().fail_opens.push(FailOpenEvent { component, reason });
    }

    fn record_circuit_transition(&self, component: MetricComponent, from: &str, to: &str) {
        self.recorded().circuit_transitions.push(CircuitTransitionEvent {
            component,
            from: from.to_string(),
            to: to.to_string(),
        });
    }

    fn record_database_pool_error(&self) {
        self.recorded().database_pool_errors += 1;
    }

    fn observe_database_pool(&self, read: DatabasePoolReader) {
        self.recorded().database_pool_observers.push(read);
    }

    fn record_database_pool_acquire_timeout(&self, phase: PoolAcquirePhase) {
        self.recorded().database_pool_acquire_timeouts.push(phase);
    }

    fn record_rate_limited(&self, route: &str, subject: RateLimitSubject) {
        self.recorded().rate_limited.push(RateLimitedEvent { route: route.to_string(), subject });
    }

    fn record_outbound_url_refused(
        &self,
        reason: OutboundUrlRefusalReason,
        purpose: OutboundUrlPurpose,
    ) {
        self.recorded().outbound_url_refused.push(OutboundUrlRefusedEvent { reason, purpose });
    }

    fn record_email_sent(&self, template: EmailTemplate, outcome: EmailOutcome) {
        self.recorded().emails_sent.push(EmailSentEvent { template, outcome });
    }

    fn record_security_event(&self, event_type: &str) {
        self.recorded().security_events.push(event_type.to_string());
    }

    fn record_tool_call(&self, surface: &str, tool: &str, outcome: &str) {
        self.recorded().tool_calls.push(ToolCallEvent {
            surface: surface.to_string(),
            tool: tool.to_string(),
            outcome: outcome.to_string(),
        });
    }

    fn record_mcp_tool_refused(&self, tool: &str, scope: &str) {
        self.recorded()
            .mcp_tool_refused
            .push(McpToolRefusedEvent { tool: tool.to_string(), scope: scope.to_string() });
    }

    fn record_llm_call(&self, call: LlmCallMetric) {
        self.recorded().llm_calls.push(call);
    }

    fn record_llm_tokens(&self, provider: &str, direction: LlmTokenDirection, count: u64) {
        self.recorded().llm_tokens.push(LlmTokensEvent {
            provider: provider.to_string(),
            direction,
            count,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::ports::metrics::{LlmCallOutcome, LlmOperation};

    #[test]
    fn records_every_kind_of_event() {
        let metrics = FakeMetrics::default();

        metrics.record_cache_hit();
        metrics.record_cache_miss();
        metrics.record_cache_miss();
        metrics.record_fail_open(MetricComponent::Cache, FailOpenReason::CircuitOpen);
        metrics.record_circuit_transition(MetricComponent::RateLimit, "closed", "open");
        metrics.record_database_pool_error();
        metrics.observe_database_pool(Box::new(|| DatabasePoolState {
            total: 5,
            idle: 2,
            waiting: 1,
        }));
        metrics.record_database_pool_acquire_timeout(PoolAcquirePhase::Queued);
        metrics.record_rate_limited("totp", RateLimitSubject::Ip);
        metrics.record_outbound_url_refused(
            OutboundUrlRefusalReason::PrivateAddress,
            OutboundUrlPurpose::JobPosting,
        );
        metrics.record_email_sent(EmailTemplate::WeeklyDigest, EmailOutcome::Failed);
        metrics.record_security_event("password_changed");
        metrics.record_tool_call("mcp", "list_applications", "ok");
        metrics.record_mcp_tool_refused("create_note", "read");
        metrics.record_llm_call(LlmCallMetric {
            provider: "anthropic".to_string(),
            model: None,
            operation: LlmOperation::Stream,
            outcome: LlmCallOutcome::Aborted,
            error_kind: None,
            duration_ms: 12.5,
        });
        metrics.record_llm_tokens("anthropic", LlmTokenDirection::CacheRead, 40);

        assert_eq!(metrics.hits(), 1);
        assert_eq!(metrics.misses(), 2);
        assert_eq!(
            metrics.fail_opens(),
            vec![FailOpenEvent {
                component: MetricComponent::Cache,
                reason: FailOpenReason::CircuitOpen
            }]
        );
        assert_eq!(metrics.circuit_transitions()[0].to, "open");
        assert_eq!(metrics.database_pool_errors(), 1);
        assert_eq!(
            metrics.database_pool_observations(),
            vec![DatabasePoolState { total: 5, idle: 2, waiting: 1 }]
        );
        assert_eq!(metrics.database_pool_acquire_timeouts(), vec![PoolAcquirePhase::Queued]);
        assert_eq!(metrics.rate_limited()[0].route, "totp");
        assert_eq!(metrics.outbound_url_refused()[0].purpose, OutboundUrlPurpose::JobPosting);
        assert_eq!(metrics.emails_sent()[0].outcome, EmailOutcome::Failed);
        assert_eq!(metrics.security_events(), vec!["password_changed"]);
        assert_eq!(metrics.tool_calls()[0].tool, "list_applications");
        assert_eq!(metrics.mcp_tool_refused()[0].scope, "read");
        assert_eq!(metrics.llm_calls()[0].outcome, LlmCallOutcome::Aborted);
        assert_eq!(metrics.llm_tokens()[0].count, 40);
    }
}
