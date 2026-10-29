import { context as otelContext, type Context } from '@opentelemetry/api';
import { ATTR_GRAPHQL_OPERATION_NAME } from '@opentelemetry/semantic-conventions/incubating';

import { recordOperationSpanName } from '#src/infrastructure/observability/operationSpanName.js';

/**
 * The span-name suffix of a request whose document failed validation
 * (JEF-472): `POST /graphql validation_failed`.
 */
export const VALIDATION_FAILED_OPERATION = 'validation_failed';

/**
 * Names the trace of a GraphQL request that failed validation, and tags the
 * root span with the operation the client said it was sending.
 *
 * The `preExecution` hook that names every other request never runs for this
 * one: Mercurius validates first and throws, so the trace stayed a bare
 * `POST /graphql` that could not be told from any other. The document was
 * never accepted, so the name is a fixed word and not the client's
 * `operationName` (`recordOperationSpanName` needs a bounded set); the
 * client's own name goes on as an attribute, where an odd value only costs
 * a filter. The span is left `OK`: a stale client is not a server fault, so
 * it must not count towards the error-rate monitor.
 */
export function recordValidationFailure(
  operationName: string | undefined,
  ctx: Context = otelContext.active(),
): void {
  const span = recordOperationSpanName(VALIDATION_FAILED_OPERATION, ctx);
  if (span && operationName) span.setAttribute(ATTR_GRAPHQL_OPERATION_NAME, operationName);
}
