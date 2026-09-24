import Fastify from 'fastify';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it, vi } from 'vitest';
import type { LogRecord } from '@opentelemetry/api-logs';
import { createOtelLogDestination } from '#src/infrastructure/observability/otelLogDestination.js';
import {
  serializeLoggedError,
  serializeLoggedErrorForPino,
} from '#src/infrastructure/observability/serializeLoggedError.js';

const EMAIL = 'never-seen-before@example.com';

/**
 * The real class, not a lookalike: the redaction keys off drizzle's message
 * format (`Failed query: …\nparams: …`), so if that format ever changes this
 * is where it should fail. `Error.captureStackTrace` hides the constructor
 * frame, which is why the caller below shows up at the head of the stack.
 */
function findUserByEmail(): DrizzleQueryError {
  return new DrizzleQueryError(
    'select "id", "email" from "User" where "User"."email" = $1 limit $2',
    [EMAIL, 1],
    new Error('Connection terminated unexpectedly'),
  );
}

describe('serializeLoggedError', () => {
  it('keeps no bound parameter of a failed query, in any field', () => {
    const serialized = serializeLoggedError(findUserByEmail());

    expect(JSON.stringify(serialized)).not.toContain(EMAIL);
    expect(serialized.message).not.toContain(EMAIL);
    expect(serialized.stack).not.toContain(EMAIL);
    expect(serialized).not.toHaveProperty('params');
    expect(serialized).not.toHaveProperty('query');
  });

  it('keeps the SQL and its placeholders, which hold no values', () => {
    const serialized = serializeLoggedError(findUserByEmail());

    expect(serialized.message).toContain('"User"."email" = $1');
    expect(serialized.message).toContain('params: [redacted]');
  });

  it('keeps a stack that still names the function that threw', () => {
    const serialized = serializeLoggedError(findUserByEmail());

    expect(serialized.stack).toContain('findUserByEmail');
  });

  it('keeps name, type and code, which the expected/unexpected split relies on', () => {
    const error = Object.assign(new TypeError('Nope'), { code: 'CONFLICT' });

    expect(serializeLoggedError(error)).toMatchObject({
      name: 'TypeError',
      type: 'TypeError',
      message: 'Nope',
      code: 'CONFLICT',
    });
  });

  it('keeps a numeric code', () => {
    expect(serializeLoggedError(Object.assign(new Error('boom'), { code: 500 }))).toMatchObject({
      code: 500,
    });
  });

  it('drops an unexpected extra property rather than logging it', () => {
    const error = Object.assign(new Error('Provider refused'), {
      detail: `{"prompt":"${EMAIL}"}`,
      response: { headers: { authorization: 'Bearer secret-token' } },
      config: { url: `https://api.example.com/v1?email=${EMAIL}` },
    });

    const serialized = serializeLoggedError(error);

    expect(serialized).toEqual({
      name: 'Error',
      type: 'Error',
      message: 'Provider refused',
      stack: error.stack,
    });
    expect(JSON.stringify(serialized)).not.toContain('secret-token');
  });

  it('gives a cause the same treatment instead of trusting or dropping it', () => {
    const error = Object.assign(new Error('Login failed'), { cause: findUserByEmail() });

    const serialized = serializeLoggedError(error);

    expect(serialized.cause?.type).toBe('DrizzleQueryError');
    expect(JSON.stringify(serialized)).not.toContain(EMAIL);
  });

  it('stops following a cause chain at a fixed depth', () => {
    const chain = [4, 3, 2, 1, 0].reduce<Error>(
      (cause, level) => Object.assign(new Error(`level ${level}`), { cause }),
      new Error('deepest'),
    );

    let node = serializeLoggedError(chain);
    let depth = 0;
    while (node.cause) {
      node = node.cause;
      depth += 1;
    }

    expect(depth).toBe(5);
  });

  it('describes a non-error by its shape and never by its values', () => {
    const serialized = serializeLoggedError({ sessionId: 'sess_1', email: EMAIL });

    expect(serialized).toEqual({
      name: 'NonError',
      type: 'NonError',
      message: 'Non-Error Object logged with keys: sessionId, email',
      stack: '',
    });
  });

  it.each([
    [null, 'Non-Error value logged: null'],
    [undefined, 'Non-Error value logged: undefined'],
    ['a string that might be user data', 'Non-Error value logged: string'],
    [42, 'Non-Error value logged: number'],
    [[EMAIL, 1], 'Non-Error array logged with 2 entries'],
  ])('describes %s without quoting it', (value, message) => {
    expect(serializeLoggedError(value)).toEqual({
      name: 'NonError',
      type: 'NonError',
      message,
      stack: '',
    });
  });

  /**
   * PinoLogger serializes, then hands pino a value pino's own `err`
   * serializer sees again. The second pass has to be a no-op, or it would
   * undo the first one's work.
   */
  it('is idempotent', () => {
    const once = serializeLoggedError(findUserByEmail());

    expect(serializeLoggedError(once)).toEqual(once);
  });
});

describe('the pino err serializer', () => {
  /**
   * Both copies of a log line are written by the same pino instance — the
   * OTLP record for Axiom and the stdout line Cloud Logging collects — so
   * this asserts on both at once, through the wiring `index.ts` uses.
   */
  function logThrough(err: unknown) {
    const stdoutWrite = vi.fn();
    const emit = vi.fn<(record: LogRecord) => void>();
    const app = Fastify({
      logger: {
        level: 'error',
        serializers: { err: serializeLoggedErrorForPino },
        stream: createOtelLogDestination({ stdout: { write: stdoutWrite }, logger: { emit } }),
      },
    });

    app.log.error(err, 'query failed');

    return {
      stdout: String(stdoutWrite.mock.calls[0]?.[0]),
      attributes: emit.mock.calls[0]?.[0].attributes ?? {},
    };
  }

  it('keeps query parameters off both the stdout line and the OTLP record', () => {
    const { stdout, attributes } = logThrough(findUserByEmail());

    expect(stdout).not.toContain(EMAIL);
    expect(JSON.stringify(attributes)).not.toContain(EMAIL);
    expect(String(attributes.err)).toContain('DrizzleQueryError');
  });

  it('applies to an error Fastify itself logs, not only to PinoLogger calls', () => {
    const { stdout } = logThrough(Object.assign(new Error('boom'), { secret: EMAIL }));

    expect(stdout).not.toContain(EMAIL);
    expect(stdout).toContain('boom');
  });
});
