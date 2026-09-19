import { describe, it, expect, vi } from 'vitest';
import { ROOT_CONTEXT, SpanStatusCode, type Context, type Span } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { recordRequestFailure } from '#src/infrastructure/observability/recordRequestFailure.js';

function makeSpan() {
  return {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as Span & {
    setAttribute: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
  };
}

/** The context the http instrumentation leaves active for a server request. */
function httpContext(span: Span): Context {
  return setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span, route: '/graphql' });
}

describe('recordRequestFailure', () => {
  it('marks the HTTP server span as failed', () => {
    const span = makeSpan();

    recordRequestFailure(new Error('connect ECONNREFUSED'), undefined, httpContext(span));

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
  });

  it('keeps the error message off the span, since it can carry user data', () => {
    const span = makeSpan();
    // What a failed Drizzle query's message actually looks like.
    const error = new Error('Failed query: select … where "User"."email" = $1\nparams: a@b.com,1');

    recordRequestFailure(error, undefined, httpContext(span));

    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
    expect(span.setAttribute).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('a@b.com'),
    );
  });

  it('records a coded error under its code, so failures can be grouped', () => {
    const span = makeSpan();

    recordRequestFailure(
      new Error('the database is unreachable'),
      ERROR_CODES.SERVICE_UNAVAILABLE,
      httpContext(span),
    );

    expect(span.setAttribute).toHaveBeenCalledWith('error.type', ERROR_CODES.SERVICE_UNAVAILABLE);
  });

  it('falls back to the error class when it carries no code', () => {
    const span = makeSpan();

    recordRequestFailure(new TypeError('x is not a function'), undefined, httpContext(span));

    expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'TypeError');
  });

  it('names a subclass that never set its own name, as Drizzle query errors do', () => {
    const span = makeSpan();
    class DrizzleQueryError extends Error {}

    recordRequestFailure(new DrizzleQueryError('Failed query'), undefined, httpContext(span));

    // `error.name` here is the inherited 'Error', which says nothing.
    expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'DrizzleQueryError');
  });

  it('does nothing outside an HTTP server span', () => {
    const span = makeSpan();

    recordRequestFailure(new Error('boom'), undefined, ROOT_CONTEXT);

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.setStatus).not.toHaveBeenCalled();
  });
});
