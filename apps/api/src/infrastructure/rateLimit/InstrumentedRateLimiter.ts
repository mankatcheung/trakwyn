import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import {
  otelMetrics,
  type IMetrics,
  type RateLimitSubject,
} from '#src/infrastructure/observability/metrics.js';
import { SECURITY_EVENTS } from '#src/infrastructure/config/constants.js';

/** The subject categories a key may name. Anything else is reported as `unknown`. */
const SUBJECTS: readonly RateLimitSubject[] = ['user', 'ip', 'email'];

/** A route segment is a literal in the calling use case; this proves it. */
const ROUTE_PATTERN = /^[a-z0-9-]+$/;

const isSubject = (segment: string): segment is RateLimitSubject =>
  SUBJECTS.includes(segment as RateLimitSubject);

/**
 * Splits a bucket key into the two things that are safe to log.
 *
 * Keys are `<route>:<subject>:<value>` — `totp:ip:203.0.113.4`,
 * `resume:user:V1Sd…`. Only segments matching a known category are reported,
 * and the route only if it looks like the hard-coded literal it is supposed
 * to be, so **no part of `value` can reach a log or a metric attribute**
 * however a future key is spelled. That matters more than completeness here:
 * the value is an email address or an IP, and a category of `unknown` is a
 * missing dimension where a leaked value would be an incident (JEF-348).
 */
export function describeRateLimitKey(key: string): { route: string; subject: RateLimitSubject } {
  const [first, ...rest] = key.split(':');
  return {
    route: first && ROUTE_PATTERN.test(first) ? first : 'unknown',
    subject: rest.find(isSubject) ?? 'unknown',
  };
}

interface Deps {
  inner: IRateLimiter;
  /** The DI registration name, e.g. `totpRateLimiter` — always a literal. */
  name: string;
  logger: ILogger;
  metrics?: IMetrics;
}

/**
 * Logs and counts every rate-limit rejection (JEF-350).
 *
 * A decorator at the `IRateLimiter` boundary rather than a line in each of
 * the nineteen use cases that consume one, for the same reason
 * `InstrumentedCache` and `BlocklistingSessionRepository` are decorators: it
 * covers both implementations and every call site by construction, so a new
 * rate-limited route is observable without anyone remembering to make it so.
 *
 * Only rejections are recorded. An allowed request is the overwhelming
 * majority and says nothing; the rejection is the security event.
 */
export class InstrumentedRateLimiter implements IRateLimiter {
  private readonly inner: IRateLimiter;
  private readonly name: string;
  private readonly logger: ILogger;
  private readonly metrics: IMetrics;

  constructor({ inner, name, logger, metrics = otelMetrics }: Deps) {
    this.inner = inner;
    this.name = name;
    this.logger = logger;
    this.metrics = metrics;
  }

  async consume(key: string): Promise<boolean> {
    if (await this.inner.consume(key)) return true;

    const { route, subject } = describeRateLimitKey(key);
    // No `err`: nothing was thrown. The limiter refused on purpose, and the
    // facts are all in the fields — same shape as `logScheduledJobMisconfigured`.
    this.logger.warn('Rate limit exceeded', undefined, {
      event: SECURITY_EVENTS.RATE_LIMITED,
      limiter: this.name,
      route,
      subject,
    });
    this.metrics.recordRateLimited(route, subject);
    return false;
  }
}
