import { describe, it, expect, vi } from 'vitest';
import { ROOT_CONTEXT, type Context, type Span } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { applyOperationSpanName } from '#src/infrastructure/observability/operationSpanName.js';
import { recordValidationFailure } from '#src/infrastructure/observability/recordValidationFailure.js';

function makeSpan() {
  return {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    updateName: vi.fn(),
  } as unknown as Span & {
    setAttribute: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    updateName: ReturnType<typeof vi.fn>;
  };
}

function httpContext(span: Span): Context {
  return setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span, route: '/graphql' });
}

describe('recordValidationFailure (JEF-472)', () => {
  it('names the trace with a fixed word, however the client named its operation', () => {
    const span = makeSpan();

    recordValidationFailure('SomethingTheClientMadeUp', httpContext(span));
    applyOperationSpanName(span, { method: 'POST' });

    expect(span.updateName).toHaveBeenCalledWith('POST /graphql validation_failed');
  });

  it('records the client-sent operation as an attribute, not in the name', () => {
    const span = makeSpan();

    recordValidationFailure('Applications', httpContext(span));

    expect(span.setAttribute).toHaveBeenCalledWith('graphql.operation.name', 'Applications');
  });

  it('sets no operation attribute when the client sent none', () => {
    const span = makeSpan();

    recordValidationFailure(undefined, httpContext(span));
    applyOperationSpanName(span, { method: 'POST' });

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.updateName).toHaveBeenCalledWith('POST /graphql validation_failed');
  });

  it('leaves the span un-failed: a stale client is not a server fault', () => {
    const span = makeSpan();

    recordValidationFailure('Applications', httpContext(span));

    expect(span.setStatus).not.toHaveBeenCalled();
  });

  it('does nothing outside an HTTP server span', () => {
    expect(() => recordValidationFailure('Applications', ROOT_CONTEXT)).not.toThrow();
  });
});
