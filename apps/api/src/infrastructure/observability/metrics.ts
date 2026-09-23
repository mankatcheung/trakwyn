import { metrics, type Counter } from '@opentelemetry/api';
import { AXIOM, METRICS } from '#src/infrastructure/config/constants.js';
import type { OutboundUrlPurpose } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { SecurityEventType } from '#src/domain/securityEvent/SecurityEvent.js';

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
  /** A security event was written to the audit table (JEF-354). `type` is a bounded set. */
  recordSecurityEvent(type: SecurityEventType): void;
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
  recordSecurityEvent: () => {},
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
  private securityEvents?: Counter;

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

  recordSecurityEvent(type: SecurityEventType): void {
    this.securityEvents ??= this.meter.createCounter(METRICS.SECURITY_EVENTS, {
      description: 'Security events written to the audit table, by type',
    });
    this.securityEvents.add(1, { event_type: type });
  }
}

/** The shared instance wired into production code paths. */
export const otelMetrics: IMetrics = new OtelMetrics();
