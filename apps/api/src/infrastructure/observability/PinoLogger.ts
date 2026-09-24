import type { FastifyBaseLogger } from 'fastify';
import type { ILogger, LogFields } from '#src/use-cases/ports/ILogger.js';
import { serializeLoggedError } from '#src/infrastructure/observability/serializeLoggedError.js';

export class PinoLogger implements ILogger {
  private infoLogger?: FastifyBaseLogger;

  constructor(private readonly logger: FastifyBaseLogger) {}

  /**
   * The error is serialized here rather than left to pino's `err` serializer
   * alone, so the allow-list holds for any pino instance this wraps —
   * including the ones tests and tooling build without `index.ts`'s logger
   * config. Serializing twice is harmless: `serializeLoggedError` is
   * idempotent by design.
   */
  error(message: string, err?: unknown, fields?: LogFields): void {
    const context = this.context(err, fields);
    if (context === undefined) {
      this.logger.error(message);
      return;
    }
    this.logger.error(context, message);
  }

  /** Same shape, and the same serializer, one level down. */
  warn(message: string, err?: unknown, fields?: LogFields): void {
    const context = this.context(err, fields);
    if (context === undefined) {
      this.logger.warn(message);
      return;
    }
    this.logger.warn(context, message);
  }

  /**
   * Goes through a child logger pinned to `info` because production runs at
   * `warn` (`index.ts`), which would drop the one summary line each scheduled
   * job run emits — the line JEF-352 exists for, in the only environment where
   * its absence means anything. pino lets a child be more verbose than its
   * parent, so these lines reach Axiom without turning `info` on for every
   * request log as well. Created on first use, so a caller that never logs at
   * `info` needs nothing but the logger it was given.
   */
  info(message: string, fields?: LogFields): void {
    this.infoLogger ??= this.logger.child({}, { level: 'info' });
    if (fields === undefined) {
      this.infoLogger.info(message);
      return;
    }
    this.infoLogger.info(fields, message);
  }

  /**
   * pino reads a bare message differently from one with a context object, so
   * a line carrying neither an error nor fields keeps the single-argument
   * form it had before either existed.
   */
  private context(err: unknown, fields?: LogFields): Record<string, unknown> | undefined {
    if (err === undefined) return fields;
    return { ...fields, err: serializeLoggedError(err) };
  }
}
