import { context as otelContext, type Context, type Span } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

/**
 * The operation each in-flight HTTP server span served, as the
 * `<route> <operation>` suffix of its final name. Weak so a span that never
 * finishes cannot leak.
 */
const pendingSpanNames = new WeakMap<Span, string>();

/**
 * Every GraphQL request is `POST /graphql` and every MCP request is
 * `POST /mcp`, so without this each trace in Axiom's list has the same name
 * and cannot be told from the next (JEF-346, JEF-365). Remembers what the
 * current request's HTTP server span (the trace's root, found through the
 * RPC metadata the http instrumentation puts on the context) should be
 * called, and returns that span so the caller can tag it.
 *
 * The name cannot be set here: the http instrumentation renames its span to
 * `<method> <route>` when the response finishes, which would overwrite it.
 * Its `applyCustomAttributesOnSpan` hook is the one thing that runs after
 * that, so the rename waits for {@link applyOperationSpanName}.
 *
 * `operation` becomes part of a span name, so it must come from a bounded
 * set, never straight from a request body.
 */
export function recordOperationSpanName(
  operation: string,
  ctx: Context = otelContext.active(),
): Span | undefined {
  const rpcMetadata = getRPCMetadata(ctx);
  if (rpcMetadata?.type !== RPCType.HTTP) return undefined;

  pendingSpanNames.set(
    rpcMetadata.span,
    [rpcMetadata.route, operation].filter((part) => part !== undefined).join(' '),
  );
  return rpcMetadata.span;
}

/**
 * The http instrumentation's `applyCustomAttributesOnSpan` hook: renames a
 * server span that recorded an operation to, e.g.,
 * `POST /graphql query applications` or `POST /mcp tools/call get_application`.
 * Any other span is left alone.
 */
export function applyOperationSpanName(span: Span, request: { method?: string }): void {
  const suffix = pendingSpanNames.get(span);
  if (suffix === undefined) return;

  pendingSpanNames.delete(span);
  // Same fallback the http instrumentation uses for its own name.
  span.updateName(`${request.method || 'GET'} ${suffix}`);
}
