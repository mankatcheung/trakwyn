import type { FastifyBaseLogger } from 'fastify';
import type { ILogger, LogFields } from '#src/use-cases/ports/ILogger.js';
import { serializeLoggedError } from '#src/infrastructure/observability/serializeLoggedError.js';

export class PinoLogger implements ILogger {
  constructor(private readonly logger: FastifyBaseLogger) {}

  /**
   * The error is serialized here rather than left to pino's `err` serializer
   * alone, so the allow-list holds for any pino instance this wraps —
   * including the ones tests and tooling build without `index.ts`'s logger
   * config. Serializing twice is harmless: `serializeLoggedError` is
   * idempotent by design.
   */
  error(message: string, err?: unknown): void {
    if (err === undefined) {
      this.logger.error(message);
      return;
    }
    this.logger.error({ err: serializeLoggedError(err) }, message);
  }

  /**
   * `fields` go through untouched — unlike `error`, there is no error object
   * to reduce, and the caller has already decided each value is safe to log.
   */
  warn(message: string, fields?: LogFields): void {
    if (fields === undefined) {
      this.logger.warn(message);
      return;
    }
    this.logger.warn(fields, message);
  }
}
