import type { FastifyBaseLogger } from 'fastify';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
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
}
