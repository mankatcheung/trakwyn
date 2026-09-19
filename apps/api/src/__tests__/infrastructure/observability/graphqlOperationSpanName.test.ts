import { describe, it, expect, vi } from 'vitest';
import { ROOT_CONTEXT, type Context, type Span } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { parse } from 'graphql';
import {
  applyGraphQLOperationSpanName,
  recordGraphQLOperation,
} from '#src/infrastructure/observability/graphqlOperationSpanName.js';

function makeSpan() {
  return {
    setAttribute: vi.fn(),
    updateName: vi.fn(),
  } as unknown as Span & {
    setAttribute: ReturnType<typeof vi.fn>;
    updateName: ReturnType<typeof vi.fn>;
  };
}

/** The context the http instrumentation leaves active for a server request. */
function httpContext(span: Span, route: string | undefined = '/graphql'): Context {
  return setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span, route });
}

describe('graphqlOperationSpanName', () => {
  it('renames the HTTP server span after a named operation once the response finishes', () => {
    const span = makeSpan();

    recordGraphQLOperation(
      parse('query applications { __typename }'),
      undefined,
      httpContext(span),
    );
    expect(span.updateName).not.toHaveBeenCalled();

    applyGraphQLOperationSpanName(span, { method: 'POST' });
    expect(span.updateName).toHaveBeenCalledWith('POST /graphql query applications');
  });

  it('tags the span with the operation type and name', () => {
    const span = makeSpan();

    recordGraphQLOperation(parse('mutation login { __typename }'), undefined, httpContext(span));

    expect(span.setAttribute).toHaveBeenCalledWith('graphql.operation.type', 'mutation');
    expect(span.setAttribute).toHaveBeenCalledWith('graphql.operation.name', 'login');
  });

  it('uses the operation the request selected when the document has several', () => {
    const span = makeSpan();
    const document = parse('query first { __typename } query second { __typename }');

    recordGraphQLOperation(document, 'second', httpContext(span));
    applyGraphQLOperationSpanName(span, { method: 'POST' });

    expect(span.updateName).toHaveBeenCalledWith('POST /graphql query second');
  });

  it('falls back to the operation type for an anonymous operation', () => {
    const span = makeSpan();

    recordGraphQLOperation(parse('{ __typename }'), undefined, httpContext(span));
    applyGraphQLOperationSpanName(span, { method: 'GET' });

    expect(span.updateName).toHaveBeenCalledWith('GET /graphql query');
    expect(span.setAttribute).not.toHaveBeenCalledWith('graphql.operation.name', expect.anything());
  });

  it('leaves the span alone when the operation cannot be determined', () => {
    const span = makeSpan();
    const document = parse('query first { __typename } query second { __typename }');

    recordGraphQLOperation(document, undefined, httpContext(span));
    applyGraphQLOperationSpanName(span, { method: 'POST' });

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.updateName).not.toHaveBeenCalled();
  });

  it('does nothing outside an HTTP server span', () => {
    const span = makeSpan();

    recordGraphQLOperation(parse('query applications { __typename }'), undefined, ROOT_CONTEXT);
    applyGraphQLOperationSpanName(span, { method: 'POST' });

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.updateName).not.toHaveBeenCalled();
  });

  it('only renames a span once, and leaves spans that served no GraphQL operation alone', () => {
    const graphqlSpan = makeSpan();
    const otherSpan = makeSpan();

    recordGraphQLOperation(
      parse('query applications { __typename }'),
      undefined,
      httpContext(graphqlSpan),
    );
    applyGraphQLOperationSpanName(graphqlSpan, { method: 'POST' });
    applyGraphQLOperationSpanName(graphqlSpan, { method: 'POST' });
    applyGraphQLOperationSpanName(otherSpan, { method: 'GET' });

    expect(graphqlSpan.updateName).toHaveBeenCalledOnce();
    expect(otherSpan.updateName).not.toHaveBeenCalled();
  });
});
