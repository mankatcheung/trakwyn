import { context as otelContext, SpanStatusCode, type Context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

/**
 * Marks the HTTP server span — the trace's root — as failed (JEF-346).
 *
 * GraphQL answers 200 with the errors in the body (`buildApp`'s
 * `errorFormatter` pins the status; the real one rides in `extensions`), so
 * the http instrumentation, which only sees the transport, records every
 * failed request as a success. The exception itself lands on the
 * `graphql.resolve` span underneath, but a trace whose root looks fine is
 * one nobody opens: in Axiom's list a failure is indistinguishable from a
 * normal request.
 *
 * Called only for errors `formatError` treats as server faults — the same
 * split that decides what is logged — so an expected `NOT_FOUND` or a wrong
 * password does not paint a trace red. No-ops outside an HTTP server span,
 * which is how the MCP route and the tests reach it.
 */
export function recordRequestFailure(
  error: Error,
  code: string | undefined,
  ctx: Context = otelContext.active(),
): void {
  const rpcMetadata = getRPCMetadata(ctx);
  if (rpcMetadata?.type !== RPCType.HTTP) return;

  // Deliberately no `message`: an error message is free text that can carry
  // user data — a failed Drizzle query puts the statement's parameters, such
  // as the email being looked up, in its own. The type is enough to group
  // failures on, and the exception with its message and stack is already on
  // the resolver's span. `error.name` is not enough either: a
  // DrizzleQueryError's name is the inherited 'Error'.
  rpcMetadata.span.setAttribute(ATTR_ERROR_TYPE, code ?? error.constructor?.name ?? error.name);
  rpcMetadata.span.setStatus({ code: SpanStatusCode.ERROR });
}
