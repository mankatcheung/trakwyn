import { context as otelContext, type Context } from '@opentelemetry/api';
import {
  ATTR_GRAPHQL_OPERATION_NAME,
  ATTR_GRAPHQL_OPERATION_TYPE,
} from '@opentelemetry/semantic-conventions/incubating';
import type { DocumentNode } from 'graphql';

import {
  describeGraphQLOperation,
  formatGraphQLOperation,
} from '#src/infrastructure/observability/graphqlOperation.js';
import { recordOperationSpanName } from '#src/infrastructure/observability/operationSpanName.js';

/**
 * Names a GraphQL request's trace after its operation, e.g.
 * `POST /graphql query applications` (JEF-346), and tags the root span with
 * the operation type and name. Called from a Mercurius `preExecution` hook;
 * `operationSpanName.ts` has how and when the rename is applied.
 */
export function recordGraphQLOperation(
  document: DocumentNode,
  operationName: string | null | undefined,
  ctx: Context = otelContext.active(),
): void {
  const operation = describeGraphQLOperation(document, operationName);
  if (!operation) return;

  const { type, name } = operation;
  const span = recordOperationSpanName(formatGraphQLOperation(operation), ctx);
  if (!span) return;

  span.setAttribute(ATTR_GRAPHQL_OPERATION_TYPE, type);
  if (name) span.setAttribute(ATTR_GRAPHQL_OPERATION_NAME, name);
}
