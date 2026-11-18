import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { Mock } from 'vitest';

/**
 * Typed responses for a mocked `gqlClient.request` (JEF-652).
 *
 * ```ts
 * mockGql(mockGqlRequest, [
 *   respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: true }),
 *   respondError(VERIFY_STEP_UP_CODE, new Error('Code refused')),
 * ]);
 * ```
 *
 * Each response must satisfy the document's `ResultOf`, so a field renamed or
 * removed from the selection (or the schema, once codegen is re-run) fails
 * `pnpm typecheck` in every test that mocks it. An operation nobody mocked
 * throws an error naming it instead of resolving `undefined`.
 */

type AnyRequest = Mock<(...args: never[]) => unknown>;

export type GqlResponse = {
  readonly operation: string;
  readonly settle: (variables: unknown) => Promise<unknown>;
};

/** The operation name of a typed document (or of a not-yet-converted string). */
export function operationName(document: unknown): string {
  if (typeof document === 'string') {
    const match = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/.exec(document);
    if (match?.[1]) return match[1];
  } else {
    const definitions =
      (document as { definitions?: { kind?: string; name?: { value: string } }[] } | null)
        ?.definitions ?? [];
    const named = definitions.find((d) => d.kind === 'OperationDefinition' && d.name);
    if (named?.name) return named.name.value;
  }
  throw new Error('mockGql: the request document has no named operation');
}

/**
 * Answers `document` with `data`, or with `(variables) => data` when the
 * answer depends on what was sent. `data` is typed by the document.
 */
export function respond<R, V>(
  document: TypedDocumentNode<R, V>,
  data: R | ((variables: V) => R),
): GqlResponse {
  return {
    operation: operationName(document),
    settle: (variables) =>
      Promise.resolve(typeof data === 'function' ? (data as (v: V) => R)(variables as V) : data),
  };
}

/**
 * Answers `document` with the promise `handler` returns, for a test that settles the
 * request itself (a response held open, then released) and still wants it typed.
 */
export function respondWith<R, V>(
  document: TypedDocumentNode<R, V>,
  handler: (variables: V) => Promise<R>,
): GqlResponse {
  return {
    operation: operationName(document),
    settle: (variables) => handler(variables as V),
  };
}

/** Rejects `document` with `error`, for the failure path. */
export function respondError<R, V>(document: TypedDocumentNode<R, V>, error: unknown): GqlResponse {
  return { operation: operationName(document), settle: () => Promise.reject(error) };
}

/**
 * Installs the responses on `request`, replacing any earlier implementation.
 * A later entry for the same operation wins, so a test can override a default
 * set in `beforeEach` by calling `mockGql` again with the full list.
 */
export function mockGql(request: AnyRequest, responses: readonly GqlResponse[]): void {
  const byOperation = new Map(responses.map((r) => [r.operation, r]));
  (request as Mock<(document: unknown, variables?: unknown) => unknown>).mockImplementation(
    (document, variables) => {
      const name = operationName(document);
      const response = byOperation.get(name);
      if (!response) {
        const known = [...byOperation.keys()].join(', ') || 'none';
        return Promise.reject(
          new Error(`mockGql: no response for operation "${name}" (mocked: ${known})`),
        );
      }
      return response.settle(variables);
    },
  );
}
