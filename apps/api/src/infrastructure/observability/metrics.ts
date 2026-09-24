import { metrics, type Counter, type Histogram } from '@opentelemetry/api';
import { AXIOM } from '#src/infrastructure/config/constants.js';
import type { OutboundUrlPurpose } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { SecurityEventType } from '#src/domain/securityEvent/SecurityEvent.js';
import type { LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';

/**
 * OpenTelemetry metric names (JEF-129). Dot-separated per OTel naming
 * convention, and prefixed so they're distinguishable from the metrics the
 * auto-instrumentations emit.
 *
 * Kept beside the counters rather than in `infrastructure/config/constants.ts`:
 * this module is their only reader (JEF-356).
 */
export const METRICS = {
  CACHE_HITS: 'trakwyn.cache.hits',
  CACHE_MISSES: 'trakwyn.cache.misses',
  /** Redis call degraded gracefully rather than failing the request — attributes: component, reason. */
  REDIS_FAIL_OPEN: 'trakwyn.redis.fail_open',
  /** Circuit breaker state change — attributes: component, from, to. */
  CIRCUIT_TRANSITIONS: 'trakwyn.redis.circuit_transitions',
  /**
   * Postgres pool errors on an idle client (JEF-351). Neon closes idle
   * sockets, so a non-zero rate is normal; a rising one means POOL_IDLE_TIMEOUT_MS
   * is out of step with how long Neon actually keeps a connection.
   */
  DB_POOL_ERRORS: 'trakwyn.db.pool_errors',
  /** A request a rate limiter rejected — attributes: route, subject (JEF-350). */
  RATE_LIMITED: 'trakwyn.security.rate_limited',
  /** A URL `OutboundUrlPolicy` refused — attributes: reason, purpose (JEF-350). */
  OUTBOUND_URL_REFUSED: 'trakwyn.security.outbound_url.refused',
  /** One Brevo send attempt — attributes: template, outcome (JEF-356). */
  EMAILS_SENT: 'trakwyn.email.sent',
  /** A row written to the `SecurityEvent` audit table — attributes: event_type (JEF-354). */
  SECURITY_EVENTS: 'trakwyn.security.events',
  /** One LLM call through `forUser` — attributes: provider, model, operation, outcome, error_kind (JEF-113). */
  LLM_CALLS: 'trakwyn.llm.calls',
  /** Tokens an LLM call used — attributes: provider, direction (JEF-113). */
  LLM_TOKENS: 'trakwyn.llm.tokens',
  /** Provider latency of one LLM call, in ms — same attributes as `LLM_CALLS` (JEF-113). */
  LLM_DURATION: 'trakwyn.llm.duration',
} as const;

/** Which Redis-backed subsystem a resilience event came from. */
export type MetricComponent = 'cache' | 'rate_limit' | 'session_blocklist';

/** Why a call fell back to its fail-open path. */
export type FailOpenReason = 'error' | 'circuit_open';

/**
 * What a rate-limit bucket is keyed on, as a category rather than the value
 * (JEF-350). The raw key holds a user id, an email or an IP address; only
 * which *kind* of subject was limited is ever recorded.
 */
export type RateLimitSubject = 'user' | 'ip' | 'email' | 'unknown';

/** Why `OutboundUrlPolicy` refused a URL — one stable code per rejection branch. */
export type OutboundUrlRefusalReason =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'embedded_credentials'
  | 'insecure_provider_url'
  | 'blocked_port'
  | 'reserved_hostname'
  | 'unresolvable_host'
  | 'private_address';

/** Which transactional email a send was — one per `IEmailService` method (JEF-356). */
export type EmailTemplate =
  | 'follow_up_reminder'
  | 'weekly_digest'
  | 'password_reset'
  | 'email_verification'
  | 'backup_email_verification'
  | 'new_device_login_alert';

/** Whether the provider accepted the message. `failed` covers a non-2xx answer and a request that never got one. */
export type EmailOutcome = 'sent' | 'failed';

/** `complete()` or `completeWithToolsStream()` — the two `ILLMProvider` methods (JEF-113). */
export type LlmOperation = 'complete' | 'stream';

/**
 * How an LLM call ended. `aborted` is a stream the consumer stopped before
 * `done` (client disconnect, idle timeout) — not a provider fault, so it is
 * kept apart from `error` rather than inflating the error rate.
 */
export type LlmCallOutcome = 'success' | 'error' | 'aborted';

/** Which side of a call a token count is for. The cache directions break `input` down, as `LLMUsage` does. */
export type LlmTokenDirection = 'input' | 'output' | 'cache_read' | 'cache_write';

/** One LLM call, as `recordLlmCall` receives it. No content: every field is a bounded label or a number. */
export interface LlmCallMetric {
  provider: string;
  model: string | null;
  operation: LlmOperation;
  outcome: LlmCallOutcome;
  /** `LlmProviderError.kind` on a provider refusal; null otherwise. */
  errorKind: LlmProviderErrorKind | null;
  durationMs: number;
}

/**
 * Counters for cache effectiveness and Redis resilience (JEF-129), and for
 * the security mechanisms that would otherwise refuse a request silently
 * (JEF-350).
 *
 * An interface rather than direct OTel calls so tests can assert on
 * recorded events by injecting a fake, the same way `CircuitBreaker` is
 * injectable into the classes that use it.
 */
export interface IMetrics {
  recordCacheHit(): void;
  recordCacheMiss(): void;
  /** A Redis call failed (or was short-circuited) and the caller degraded gracefully instead of erroring. */
  recordFailOpen(component: MetricComponent, reason: FailOpenReason): void;
  recordCircuitTransition(component: MetricComponent, from: string, to: string): void;
  /**
   * The Postgres pool reported an error on an idle client — its socket was
   * closed from the other end (JEF-351). Charted alongside the fail-open
   * counters for the same reason: the pool recovers on its own, so without a
   * count a worsening rate is invisible.
   */
  recordDatabasePoolError(): void;
  /** A rate limiter rejected a request (JEF-350). `route` and `subject` are both bounded sets. */
  recordRateLimited(route: string, subject: RateLimitSubject): void;
  /** `OutboundUrlPolicy` refused to let the server connect somewhere (JEF-350). */
  recordOutboundUrlRefused(reason: OutboundUrlRefusalReason, purpose: OutboundUrlPurpose): void;
  /** One attempt to hand an email to the provider (JEF-356). No recipient: `template` is the only label. */
  recordEmailSent(template: EmailTemplate, outcome: EmailOutcome): void;
  /** A security event was written to the audit table (JEF-354). `type` is a bounded set. */
  recordSecurityEvent(type: SecurityEventType): void;
  /** One LLM call finished, succeeded or not — counted and timed (JEF-113). */
  recordLlmCall(call: LlmCallMetric): void;
  /** Tokens one LLM call used in one direction (JEF-113). */
  recordLlmTokens(provider: string, direction: LlmTokenDirection, count: number): void;
}

/** Used in tests and wherever metrics are irrelevant. */
export const noopMetrics: IMetrics = {
  recordCacheHit: () => {},
  recordCacheMiss: () => {},
  recordFailOpen: () => {},
  recordCircuitTransition: () => {},
  recordDatabasePoolError: () => {},
  recordRateLimited: () => {},
  recordOutboundUrlRefused: () => {},
  recordEmailSent: () => {},
  recordSecurityEvent: () => {},
  recordLlmCall: () => {},
  recordLlmTokens: () => {},
};

/**
 * OTel-backed IMetrics, exported to the same Axiom metrics dataset the rest
 * of the observability stack uses (see tracing.ts).
 *
 * Counters are created lazily on first use, not at module load: the OTel
 * SDK is started by `startObservability()` in index.ts, and a meter obtained
 * before that would be a no-op that never upgrades. Deferring until the
 * first recorded event guarantees the SDK is live by then. When metrics
 * aren't configured at all (local dev, tests) `getMeter` yields a no-op
 * meter, so this stays safe and allocation-cheap either way.
 */
class OtelMetrics implements IMetrics {
  private cacheHits?: Counter;
  private cacheMisses?: Counter;
  private failOpens?: Counter;
  private circuitTransitions?: Counter;
  private databasePoolErrors?: Counter;
  private rateLimited?: Counter;
  private outboundUrlRefused?: Counter;
  private emailsSent?: Counter;
  private securityEvents?: Counter;
  private llmCalls?: Counter;
  private llmTokens?: Counter;
  private llmDuration?: Histogram;

  private get meter() {
    return metrics.getMeter(AXIOM.SERVICE_NAME);
  }

  recordCacheHit(): void {
    this.cacheHits ??= this.meter.createCounter(METRICS.CACHE_HITS, {
      description: 'Cache reads served without invoking the underlying fetch',
    });
    this.cacheHits.add(1);
  }

  recordCacheMiss(): void {
    this.cacheMisses ??= this.meter.createCounter(METRICS.CACHE_MISSES, {
      description: 'Cache reads that fell through to the underlying fetch',
    });
    this.cacheMisses.add(1);
  }

  recordFailOpen(component: MetricComponent, reason: FailOpenReason): void {
    this.failOpens ??= this.meter.createCounter(METRICS.REDIS_FAIL_OPEN, {
      description: 'Redis calls that degraded gracefully instead of failing the request',
    });
    this.failOpens.add(1, { component, reason });
  }

  recordCircuitTransition(component: MetricComponent, from: string, to: string): void {
    this.circuitTransitions ??= this.meter.createCounter(METRICS.CIRCUIT_TRANSITIONS, {
      description: 'Circuit breaker state changes',
    });
    this.circuitTransitions.add(1, { component, from, to });
  }

  recordDatabasePoolError(): void {
    this.databasePoolErrors ??= this.meter.createCounter(METRICS.DB_POOL_ERRORS, {
      description: 'Postgres pool errors on an idle client, whose connection was already discarded',
    });
    this.databasePoolErrors.add(1);
  }

  recordRateLimited(route: string, subject: RateLimitSubject): void {
    this.rateLimited ??= this.meter.createCounter(METRICS.RATE_LIMITED, {
      description: 'Requests rejected by a rate limiter',
    });
    this.rateLimited.add(1, { route, subject });
  }

  recordOutboundUrlRefused(reason: OutboundUrlRefusalReason, purpose: OutboundUrlPurpose): void {
    this.outboundUrlRefused ??= this.meter.createCounter(METRICS.OUTBOUND_URL_REFUSED, {
      description: 'Outbound URLs refused before the server connected to them',
    });
    this.outboundUrlRefused.add(1, { reason, purpose });
  }

  recordEmailSent(template: EmailTemplate, outcome: EmailOutcome): void {
    this.emailsSent ??= this.meter.createCounter(METRICS.EMAILS_SENT, {
      description: 'Transactional emails handed to the provider, by template and outcome',
    });
    this.emailsSent.add(1, { template, outcome });
  }

  recordSecurityEvent(type: SecurityEventType): void {
    this.securityEvents ??= this.meter.createCounter(METRICS.SECURITY_EVENTS, {
      description: 'Security events written to the audit table, by type',
    });
    this.securityEvents.add(1, { event_type: type });
  }

  recordLlmCall({
    provider,
    model,
    operation,
    outcome,
    errorKind,
    durationMs,
  }: LlmCallMetric): void {
    this.llmCalls ??= this.meter.createCounter(METRICS.LLM_CALLS, {
      description: "LLM calls made on a user's key, by provider, model and outcome",
    });
    this.llmDuration ??= this.meter.createHistogram(METRICS.LLM_DURATION, {
      description: 'Provider latency of LLM calls',
      unit: 'ms',
    });
    const attributes = {
      provider,
      model: model ?? 'unknown',
      operation,
      outcome,
      ...(errorKind ? { error_kind: errorKind } : {}),
    };
    this.llmCalls.add(1, attributes);
    this.llmDuration.record(durationMs, attributes);
  }

  recordLlmTokens(provider: string, direction: LlmTokenDirection, count: number): void {
    this.llmTokens ??= this.meter.createCounter(METRICS.LLM_TOKENS, {
      description: "Tokens used by LLM calls on a user's key, by provider and direction",
    });
    this.llmTokens.add(count, { provider, direction });
  }
}

/** The shared instance wired into production code paths. */
export const otelMetrics: IMetrics = new OtelMetrics();
