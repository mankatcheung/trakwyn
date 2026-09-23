import {
  SUSPICIOUS_SECURITY_EVENT_TYPES,
  type SecurityEvent,
} from '#src/domain/securityEvent/SecurityEvent.js';
import type {
  CreateSecurityEventData,
  ISecurityEventRepository,
} from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';

interface Deps {
  inner: ISecurityEventRepository;
  logger: ILogger;
  metrics?: IMetrics;
}

/**
 * Logs and counts every security event as it is written (JEF-354).
 *
 * The `SecurityEvent` table is the audit record; this makes the same events
 * visible to Axiom, where they can be charted and alerted on. A decorator at
 * the repository boundary rather than a line in each of the use cases that
 * write one, for the same reason as `BlocklistingSessionRepository` and
 * `InstrumentedRateLimiter`: every writer is covered by construction, and a
 * new event type is observable without anyone remembering to make it so.
 *
 * The line carries the user id and event type **only**. The IP address and
 * user agent stay in the table, which is deleted with the user on erasure; a
 * log line is not, so copying them here would defeat that (`LogFields`).
 *
 * The row is written first, and the log follows only if it landed, so a line
 * in Axiom always has a row behind it.
 */
export class LoggingSecurityEventRepository implements ISecurityEventRepository {
  private readonly inner: ISecurityEventRepository;
  private readonly logger: ILogger;
  private readonly metrics: IMetrics;

  constructor({ inner, logger, metrics = otelMetrics }: Deps) {
    this.inner = inner;
    this.logger = logger;
    this.metrics = metrics;
  }

  async create(data: CreateSecurityEventData): Promise<SecurityEvent> {
    const event = await this.inner.create(data);

    const fields = {
      event: `security.${data.eventType}`,
      eventType: data.eventType,
      userId: data.userId,
    };
    if (SUSPICIOUS_SECURITY_EVENT_TYPES.has(data.eventType)) {
      this.logger.warn('Suspicious security event', undefined, fields);
    } else {
      this.logger.info('Security event', fields);
    }
    this.metrics.recordSecurityEvent(data.eventType);

    return event;
  }

  findRecentByUserId(userId: string, limit: number): Promise<SecurityEvent[]> {
    return this.inner.findRecentByUserId(userId, limit);
  }
}
