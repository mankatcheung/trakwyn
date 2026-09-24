import { describe, it, expect, vi } from 'vitest';
import { SeverityNumber, type LogRecord } from '@opentelemetry/api-logs';
import {
  createOtelLogDestination,
  pinoLevelToSeverity,
} from '#src/infrastructure/observability/otelLogDestination.js';

function makeDestination() {
  const stdoutWrite = vi.fn();
  const emit = vi.fn<(record: LogRecord) => void>();
  const destination = createOtelLogDestination({
    stdout: { write: stdoutWrite },
    logger: { emit },
  });
  return { destination, stdoutWrite, emit };
}

describe('pinoLevelToSeverity', () => {
  it.each([
    [10, SeverityNumber.TRACE, 'TRACE'],
    [20, SeverityNumber.DEBUG, 'DEBUG'],
    [30, SeverityNumber.INFO, 'INFO'],
    [40, SeverityNumber.WARN, 'WARN'],
    [50, SeverityNumber.ERROR, 'ERROR'],
    [60, SeverityNumber.FATAL, 'FATAL'],
  ])('maps pino level %i to %s', (level, severityNumber, severityText) => {
    expect(pinoLevelToSeverity(level)).toEqual({ severityNumber, severityText });
  });

  it('treats an unknown level as INFO', () => {
    expect(pinoLevelToSeverity(35)).toEqual({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
    });
  });
});

describe('createOtelLogDestination', () => {
  it('still writes every line to stdout unchanged', () => {
    const { destination, stdoutWrite } = makeDestination();
    const line = '{"level":50,"time":1,"msg":"boom"}\n';

    destination.write(line);

    expect(stdoutWrite).toHaveBeenCalledWith(line);
  });

  it('emits a pino JSON line as a log record with severity, body, timestamp and attributes', () => {
    const { destination, emit } = makeDestination();

    destination.write(
      `${JSON.stringify({
        level: 40,
        time: 1_700_000_000_000,
        msg: 'rate limited',
        reqId: 'req-1',
        statusCode: 429,
        err: { type: 'Error', message: 'nope' },
      })}\n`,
    );

    expect(emit).toHaveBeenCalledWith({
      severityNumber: SeverityNumber.WARN,
      severityText: 'WARN',
      body: 'rate limited',
      timestamp: 1_700_000_000_000,
      attributes: {
        reqId: 'req-1',
        statusCode: 429,
        err: '{"type":"Error","message":"nope"}',
      },
    });
  });

  it('drops pid and hostname, which the resource already identifies', () => {
    const { destination, emit } = makeDestination();

    destination.write('{"level":30,"time":1,"pid":7,"hostname":"abc","msg":"hi"}\n');

    expect(emit.mock.calls[0][0].attributes).toEqual({});
  });

  it('emits a non-JSON line verbatim at INFO rather than dropping it', () => {
    const { destination, emit } = makeDestination();

    destination.write('plain text line\n');

    expect(emit).toHaveBeenCalledWith({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'plain text line',
    });
  });

  it('never throws into the logger when emitting fails', () => {
    const stdoutWrite = vi.fn();
    const destination = createOtelLogDestination({
      stdout: { write: stdoutWrite },
      logger: {
        emit: () => {
          throw new Error('exporter exploded');
        },
      },
    });

    expect(() => destination.write('{"level":30,"time":1,"msg":"hi"}\n')).not.toThrow();
    expect(stdoutWrite).toHaveBeenCalledOnce();
  });
});
