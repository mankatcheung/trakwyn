import { SeverityNumber, type LogAttributes, type LogRecord } from '@opentelemetry/api-logs';

/** The subset of `Logger` this destination needs — `logs.getLogger()` satisfies it. */
export interface LogEmitter {
  emit(record: LogRecord): void;
}

/** The subset of a writable stream this destination needs — `process.stdout` satisfies it. */
export interface LineSink {
  write(line: string): unknown;
}

interface Severity {
  severityNumber: SeverityNumber;
  severityText: string;
}

const PINO_SEVERITIES: Record<number, Severity> = {
  10: { severityNumber: SeverityNumber.TRACE, severityText: 'TRACE' },
  20: { severityNumber: SeverityNumber.DEBUG, severityText: 'DEBUG' },
  30: { severityNumber: SeverityNumber.INFO, severityText: 'INFO' },
  40: { severityNumber: SeverityNumber.WARN, severityText: 'WARN' },
  50: { severityNumber: SeverityNumber.ERROR, severityText: 'ERROR' },
  60: { severityNumber: SeverityNumber.FATAL, severityText: 'FATAL' },
};

/**
 * Fields pino writes on every line that the log record carries elsewhere:
 * `level`/`time`/`msg` become severity/timestamp/body, and `pid`/`hostname`
 * describe the process, which the OTel resource already identifies.
 */
const PINO_ENVELOPE_KEYS = new Set(['level', 'time', 'msg', 'pid', 'hostname']);

export function pinoLevelToSeverity(level: number): Severity {
  return PINO_SEVERITIES[level] ?? PINO_SEVERITIES[30];
}

function toAttributes(entry: Record<string, unknown>): LogAttributes {
  return Object.fromEntries(
    Object.entries(entry)
      .filter(([key]) => !PINO_ENVELOPE_KEYS.has(key))
      .map(([key, value]) => [
        key,
        value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
      ]),
  ) as LogAttributes;
}

function toLogRecord(line: string): LogRecord {
  const trimmed = line.trimEnd();
  let entry: unknown;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    entry = undefined;
  }

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ...pinoLevelToSeverity(30), body: trimmed };
  }

  const record = entry as Record<string, unknown>;
  return {
    ...pinoLevelToSeverity(typeof record.level === 'number' ? record.level : 30),
    body: typeof record.msg === 'string' ? record.msg : trimmed,
    timestamp: typeof record.time === 'number' ? record.time : undefined,
    attributes: toAttributes(record),
  };
}

/**
 * A pino destination that keeps writing every line to stdout and also emits
 * it as an OpenTelemetry log record, so the Axiom log pipeline in tracing.ts
 * receives the API's logs.
 *
 * On Vercel, logs reached Axiom through Vercel's log-drain integration, which
 * read stdout on the platform side. Cloud Run has no equivalent drain, so the
 * logs travel the same OTLP route as traces and metrics instead — and are
 * flushed by the same per-response `flushObservability()` hook, which matters
 * because request-based billing throttles CPU once a response is sent.
 *
 * Passed to Fastify as `logger.stream` rather than relying on
 * `@opentelemetry/instrumentation-pino`: `index.ts` imports Fastify (and so
 * pino) as an ES module before `startObservability()` runs, and ESM imports
 * are not patched after the fact. Emitting before the logger provider is
 * registered is harmless — the global logs API is a no-op until then, and
 * stays one when Axiom isn't configured.
 */
export function createOtelLogDestination(deps: { stdout: LineSink; logger: LogEmitter }): {
  write(line: string): void;
} {
  return {
    write(line: string) {
      deps.stdout.write(line);
      try {
        deps.logger.emit(toLogRecord(line));
      } catch {
        // Telemetry must never take the logger (and so the request) down with it.
      }
    },
  };
}
