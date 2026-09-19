import { context as otelContext, type Context, type Span } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  ATTR_GRAPHQL_OPERATION_NAME,
  ATTR_GRAPHQL_OPERATION_TYPE,
} from '@opentelemetry/semantic-conventions/incubating';
import { getOperationAST, type DocumentNode } from 'graphql';

/**
 * The GraphQL operation each in-flight HTTP server span served, as the
 * `<route> <type> [name]` suffix of its final name. Weak so a span that never
 * finishes cannot leak.
 */
const pendingSpanNames = new WeakMap<Span, string>();

/**
 * Every GraphQL request is `POST /graphql`, so without this each trace in
 * Axiom's list has the same name and cannot be told from the next (JEF-346).
 * Called from a Mercurius `preExecution` hook: tags the HTTP server span —
 * the trace's root, found through the RPC metadata the http instrumentation
 * puts on the context — with the operation, and remembers the name
 * {@link applyGraphQLOperationSpanName} gives it.
 *
 * The name cannot be set here: the http instrumentation renames its span to
 * `<method> <route>` when the response finishes, which would overwrite it.
 * Its `applyCustomAttributesOnSpan` hook is the one thing that runs after
 * that, so the rename waits for it.
 */
export function recordGraphQLOperation(
  document: DocumentNode,
  operationName: string | null | undefined,
  ctx: Context = otelContext.active(),
): void {
  const rpcMetadata = getRPCMetadata(ctx);
  if (rpcMetadata?.type !== RPCType.HTTP) return;

  const operation = getOperationAST(document, operationName);
  if (!operation) return;

  const type = operation.operation;
  const name = operation.name?.value;
  rpcMetadata.span.setAttribute(ATTR_GRAPHQL_OPERATION_TYPE, type);
  if (name) rpcMetadata.span.setAttribute(ATTR_GRAPHQL_OPERATION_NAME, name);

  pendingSpanNames.set(
    rpcMetadata.span,
    [rpcMetadata.route, type, name].filter((part) => part !== undefined).join(' '),
  );
}

/**
 * The http instrumentation's `applyCustomAttributesOnSpan` hook: renames a
 * server span that served a GraphQL operation to, e.g.,
 * `POST /graphql query applications`. Any other span is left alone.
 */
export function applyGraphQLOperationSpanName(span: Span, request: { method?: string }): void {
  const suffix = pendingSpanNames.get(span);
  if (suffix === undefined) return;

  pendingSpanNames.delete(span);
  // Same fallback the http instrumentation uses for its own name.
  span.updateName(`${request.method || 'GET'} ${suffix}`);
}
