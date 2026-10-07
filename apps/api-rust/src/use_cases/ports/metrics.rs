//! Counters for cache effectiveness and Redis resilience, and for the
//! security mechanisms that would otherwise refuse a request silently.
//!
//! A trait rather than direct OpenTelemetry calls so tests can assert on what
//! was recorded by injecting a fake, and so the exporter can be added behind
//! it without touching a caller.

use super::outbound_url_policy::OutboundUrlPurpose;

/// OpenTelemetry metric names. Dot-separated per the OTel naming convention,
/// and prefixed so they are distinguishable from auto-instrumentation's.
///
/// These are the names `apps/api` exports and the Axiom monitors
/// (`infra/axiom/monitors.tf`) query, so they must not drift.
pub mod metric_names {
    /// Cache reads served without invoking the underlying fetch.
    pub const CACHE_HITS: &str = "trakwyn.cache.hits";
    /// Cache reads that fell through to the underlying fetch.
    pub const CACHE_MISSES: &str = "trakwyn.cache.misses";
    /// A Redis call degraded gracefully rather than failing the request.
    /// Attributes: `component`, `reason`.
    pub const REDIS_FAIL_OPEN: &str = "trakwyn.redis.fail_open";
    /// A circuit breaker changed state. Attributes: `component`, `from`, `to`.
    pub const CIRCUIT_TRANSITIONS: &str = "trakwyn.redis.circuit_transitions";
    /// Postgres pool errors on an idle client, whose connection was already
    /// discarded. Neon closes idle sockets, so a non-zero rate is normal.
    pub const DB_POOL_ERRORS: &str = "trakwyn.db.pool_errors";
    /// Postgres pool connections, as a gauge. Attribute: `state`
    /// (`used`/`idle`). Unit: `{connection}`.
    pub const DB_POOL_CONNECTIONS: &str = "trakwyn.db.pool.connections";
    /// Requests queued for a Postgres connection, as a gauge. Unit:
    /// `{request}`. Above 0 for long means the pool is saturated.
    pub const DB_POOL_WAITING_REQUESTS: &str = "trakwyn.db.pool.waiting_requests";
    /// A query that failed because it never got a connection. Attribute: `phase`.
    pub const DB_POOL_ACQUIRE_TIMEOUTS: &str = "trakwyn.db.pool_acquire_timeouts";
    /// A request a rate limiter rejected. Attributes: `route`, `subject`.
    pub const RATE_LIMITED: &str = "trakwyn.security.rate_limited";
    /// A URL the outbound URL policy refused. Attributes: `reason`, `purpose`.
    pub const OUTBOUND_URL_REFUSED: &str = "trakwyn.security.outbound_url.refused";
    /// One email send attempt. Attributes: `template`, `outcome`.
    pub const EMAILS_SENT: &str = "trakwyn.email.sent";
    /// A row written to the `SecurityEvent` audit table. Attribute: `event_type`.
    pub const SECURITY_EVENTS: &str = "trakwyn.security.events";
    /// One MCP or chat tool call. Attributes: `surface`, `tool`, `outcome`.
    /// `tool` is a catalogue name or `unknown`, never what a client made up.
    pub const TOOL_CALLS: &str = "trakwyn.tool.calls";
    /// A write tool refused to a read-scoped MCP token. Attributes: `tool`, `scope`.
    pub const MCP_TOOL_REFUSED: &str = "trakwyn.mcp.tool_refused";
    /// One LLM call. Attributes: `provider`, `model`, `operation`, `outcome`,
    /// and `error_kind` when the provider refused.
    pub const LLM_CALLS: &str = "trakwyn.llm.calls";
    /// Tokens an LLM call used, added as the count. Attributes: `provider`, `direction`.
    pub const LLM_TOKENS: &str = "trakwyn.llm.tokens";
    /// Provider latency of one LLM call, a histogram in `ms`. Same attributes
    /// as [`LLM_CALLS`].
    pub const LLM_DURATION: &str = "trakwyn.llm.duration";
}

/// The attribute keys the metrics above carry, and the fixed values some of
/// them take.
pub mod metric_attributes {
    pub const COMPONENT: &str = "component";
    pub const REASON: &str = "reason";
    pub const FROM: &str = "from";
    pub const TO: &str = "to";
    pub const STATE: &str = "state";
    pub const PHASE: &str = "phase";
    pub const ROUTE: &str = "route";
    pub const SUBJECT: &str = "subject";
    pub const PURPOSE: &str = "purpose";
    pub const TEMPLATE: &str = "template";
    pub const OUTCOME: &str = "outcome";
    pub const EVENT_TYPE: &str = "event_type";
    pub const SURFACE: &str = "surface";
    pub const TOOL: &str = "tool";
    pub const SCOPE: &str = "scope";
    pub const PROVIDER: &str = "provider";
    pub const MODEL: &str = "model";
    pub const OPERATION: &str = "operation";
    pub const ERROR_KIND: &str = "error_kind";
    pub const DIRECTION: &str = "direction";

    /// `state` of a pool connection that is checked out (`total - idle`).
    pub const POOL_STATE_USED: &str = "used";
    /// `state` of a pool connection that is idle.
    pub const POOL_STATE_IDLE: &str = "idle";
    /// `model` when an LLM call did not name one.
    pub const MODEL_UNKNOWN: &str = "unknown";
}

/// Which Redis-backed subsystem a resilience event came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MetricComponent {
    Cache,
    RateLimit,
    SessionBlocklist,
}

impl MetricComponent {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Cache => "cache",
            Self::RateLimit => "rate_limit",
            Self::SessionBlocklist => "session_blocklist",
        }
    }
}

/// Why a call fell back to its fail-open path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FailOpenReason {
    Error,
    CircuitOpen,
}

impl FailOpenReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::CircuitOpen => "circuit_open",
        }
    }
}

/// What a rate-limit bucket is keyed on, as a category rather than the value.
/// The raw key holds a user id, an email or an IP address; only which *kind*
/// of subject was limited is ever recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RateLimitSubject {
    User,
    Ip,
    Email,
    Unknown,
}

impl RateLimitSubject {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Ip => "ip",
            Self::Email => "email",
            Self::Unknown => "unknown",
        }
    }
}

/// Why the outbound URL policy refused a URL: one stable code per rejection branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OutboundUrlRefusalReason {
    InvalidUrl,
    UnsupportedScheme,
    EmbeddedCredentials,
    InsecureProviderUrl,
    BlockedPort,
    ReservedHostname,
    UnresolvableHost,
    PrivateAddress,
}

impl OutboundUrlRefusalReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidUrl => "invalid_url",
            Self::UnsupportedScheme => "unsupported_scheme",
            Self::EmbeddedCredentials => "embedded_credentials",
            Self::InsecureProviderUrl => "insecure_provider_url",
            Self::BlockedPort => "blocked_port",
            Self::ReservedHostname => "reserved_hostname",
            Self::UnresolvableHost => "unresolvable_host",
            Self::PrivateAddress => "private_address",
        }
    }
}

/// Where a connection acquire timed out: `queued` behind a saturated pool, or
/// `connecting` a new client (Neon waking, the network).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PoolAcquirePhase {
    Queued,
    Connecting,
}

impl PoolAcquirePhase {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Connecting => "connecting",
        }
    }
}

/// The pool's own counts at one moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DatabasePoolState {
    pub total: u32,
    pub idle: u32,
    pub waiting: u32,
}

/// Reads the pool's counts. Called at every metric export.
pub type DatabasePoolReader = Box<dyn Fn() -> DatabasePoolState + Send + Sync>;

/// Which transactional email a send was: one per email-service method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EmailTemplate {
    FollowUpReminder,
    WeeklyDigest,
    PasswordReset,
    EmailVerification,
    BackupEmailVerification,
    NewDeviceLoginAlert,
}

impl EmailTemplate {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::FollowUpReminder => "follow_up_reminder",
            Self::WeeklyDigest => "weekly_digest",
            Self::PasswordReset => "password_reset",
            Self::EmailVerification => "email_verification",
            Self::BackupEmailVerification => "backup_email_verification",
            Self::NewDeviceLoginAlert => "new_device_login_alert",
        }
    }
}

/// Whether the provider accepted the message. `Failed` covers a non-2xx
/// answer and a request that never got one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EmailOutcome {
    Sent,
    Failed,
}

impl EmailOutcome {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Sent => "sent",
            Self::Failed => "failed",
        }
    }
}

/// `complete()` or `completeWithToolsStream()`: the two LLM provider methods.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmOperation {
    Complete,
    Stream,
}

impl LlmOperation {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Complete => "complete",
            Self::Stream => "stream",
        }
    }
}

/// How an LLM call ended. `Aborted` is a stream the consumer stopped before
/// `done` (client disconnect, idle timeout): not a provider fault, so it is
/// kept apart from `Error` rather than inflating the error rate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmCallOutcome {
    Success,
    Error,
    Aborted,
}

impl LlmCallOutcome {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Error => "error",
            Self::Aborted => "aborted",
        }
    }
}

/// Which side of a call a token count is for. The cache directions break
/// `Input` down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmTokenDirection {
    Input,
    Output,
    CacheRead,
    CacheWrite,
}

impl LlmTokenDirection {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Input => "input",
            Self::Output => "output",
            Self::CacheRead => "cache_read",
            Self::CacheWrite => "cache_write",
        }
    }
}

/// One LLM call, as `record_llm_call` receives it. No content: every field is
/// a bounded label or a number.
#[derive(Debug, Clone, PartialEq)]
pub struct LlmCallMetric {
    pub provider: String,
    /// Exported as `unknown` when absent.
    pub model: Option<String>,
    pub operation: LlmOperation,
    pub outcome: LlmCallOutcome,
    /// The provider error's kind (`auth`, `quota`, `rate_limited`,
    /// `bad_request`, `unavailable`, `unreachable`) on a provider refusal;
    /// `None` otherwise, and then the attribute is left off.
    pub error_kind: Option<String>,
    pub duration_ms: f64,
}

/// The labels that belong to domains this port does not depend on are taken
/// as `&str`: a security event type, a tool surface (`mcp`/`chat`), a tool
/// call outcome and an API token scope (`full`/`read`). Each caller passes
/// its own enum's wire spelling, which is a bounded set.
pub trait Metrics: Send + Sync {
    fn record_cache_hit(&self);
    fn record_cache_miss(&self);
    /// A Redis call failed (or was short-circuited) and the caller degraded
    /// gracefully instead of erroring.
    fn record_fail_open(&self, component: MetricComponent, reason: FailOpenReason);
    fn record_circuit_transition(&self, component: MetricComponent, from: &str, to: &str);
    /// The Postgres pool reported an error on an idle client: its socket was
    /// closed from the other end. The pool recovers on its own, so without a
    /// count a worsening rate is invisible.
    fn record_database_pool_error(&self);
    /// Report the pool's connection and waiting counts as gauges, by calling
    /// `read` at every metric export. Called once per pool.
    fn observe_database_pool(&self, read: DatabasePoolReader);
    /// A query never got a connection within the pool's acquire timeout.
    fn record_database_pool_acquire_timeout(&self, phase: PoolAcquirePhase);
    /// A rate limiter rejected a request. `route` and `subject` are both bounded sets.
    fn record_rate_limited(&self, route: &str, subject: RateLimitSubject);
    /// The outbound URL policy refused to let the server connect somewhere.
    fn record_outbound_url_refused(
        &self,
        reason: OutboundUrlRefusalReason,
        purpose: OutboundUrlPurpose,
    );
    /// One attempt to hand an email to the provider. No recipient: `template`
    /// is the only label.
    fn record_email_sent(&self, template: EmailTemplate, outcome: EmailOutcome);
    /// A security event was written to the audit table. `event_type` is a bounded set.
    fn record_security_event(&self, event_type: &str);
    /// One MCP or chat tool call and how it ended. `tool` is already bounded
    /// to the catalogue.
    fn record_tool_call(&self, surface: &str, tool: &str, outcome: &str);
    /// A write tool refused to an MCP token whose scope does not cover it.
    fn record_mcp_tool_refused(&self, tool: &str, scope: &str);
    /// One LLM call finished, succeeded or not: counted and timed.
    fn record_llm_call(&self, call: LlmCallMetric);
    /// Tokens one LLM call used in one direction.
    fn record_llm_tokens(&self, provider: &str, direction: LlmTokenDirection, count: u64);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Axiom monitors query these by name and group on these attributes.
    #[test]
    fn keeps_the_names_the_monitors_query() {
        assert_eq!(metric_names::REDIS_FAIL_OPEN, "trakwyn.redis.fail_open");
        assert_eq!(metric_names::CIRCUIT_TRANSITIONS, "trakwyn.redis.circuit_transitions");
        assert_eq!(metric_names::DB_POOL_ERRORS, "trakwyn.db.pool_errors");
        assert_eq!(metric_names::DB_POOL_WAITING_REQUESTS, "trakwyn.db.pool.waiting_requests");
        assert_eq!(metric_names::DB_POOL_ACQUIRE_TIMEOUTS, "trakwyn.db.pool_acquire_timeouts");
        assert_eq!(metric_attributes::COMPONENT, "component");
        assert_eq!(metric_attributes::TO, "to");
        assert_eq!(metric_attributes::PHASE, "phase");
    }

    #[test]
    fn keeps_every_other_metric_name() {
        assert_eq!(metric_names::CACHE_HITS, "trakwyn.cache.hits");
        assert_eq!(metric_names::CACHE_MISSES, "trakwyn.cache.misses");
        assert_eq!(metric_names::DB_POOL_CONNECTIONS, "trakwyn.db.pool.connections");
        assert_eq!(metric_names::RATE_LIMITED, "trakwyn.security.rate_limited");
        assert_eq!(metric_names::OUTBOUND_URL_REFUSED, "trakwyn.security.outbound_url.refused");
        assert_eq!(metric_names::EMAILS_SENT, "trakwyn.email.sent");
        assert_eq!(metric_names::SECURITY_EVENTS, "trakwyn.security.events");
        assert_eq!(metric_names::TOOL_CALLS, "trakwyn.tool.calls");
        assert_eq!(metric_names::MCP_TOOL_REFUSED, "trakwyn.mcp.tool_refused");
        assert_eq!(metric_names::LLM_CALLS, "trakwyn.llm.calls");
        assert_eq!(metric_names::LLM_TOKENS, "trakwyn.llm.tokens");
        assert_eq!(metric_names::LLM_DURATION, "trakwyn.llm.duration");
    }

    #[test]
    fn spells_the_attribute_values_as_the_original_does() {
        assert_eq!(MetricComponent::Cache.as_str(), "cache");
        assert_eq!(MetricComponent::RateLimit.as_str(), "rate_limit");
        assert_eq!(MetricComponent::SessionBlocklist.as_str(), "session_blocklist");
        assert_eq!(FailOpenReason::Error.as_str(), "error");
        assert_eq!(FailOpenReason::CircuitOpen.as_str(), "circuit_open");
        assert_eq!(RateLimitSubject::Unknown.as_str(), "unknown");
        assert_eq!(PoolAcquirePhase::Queued.as_str(), "queued");
        assert_eq!(PoolAcquirePhase::Connecting.as_str(), "connecting");
        assert_eq!(EmailTemplate::NewDeviceLoginAlert.as_str(), "new_device_login_alert");
        assert_eq!(LlmTokenDirection::CacheWrite.as_str(), "cache_write");
        assert_eq!(OutboundUrlRefusalReason::PrivateAddress.as_str(), "private_address");
    }
}
