import { getOperationAST, type DocumentNode } from 'graphql';

export interface GraphQLOperationDescription {
  /** `query`, `mutation` or `subscription`. */
  readonly type: 'query' | 'mutation' | 'subscription';
  /** The operation's name, absent for an anonymous one. */
  readonly name: string | undefined;
}

/**
 * Which operation a request runs: the one `operationName` selects, or the
 * document's only one. `null` when that cannot be told (several operations and
 * no match). Reads the document's operation only, never its variables or text,
 * so what it returns is safe to log (JEF-689).
 */
export function describeGraphQLOperation(
  document: DocumentNode,
  operationName: string | null | undefined,
): GraphQLOperationDescription | null {
  const operation = getOperationAST(document, operationName);
  if (!operation) return null;
  return { type: operation.operation, name: operation.name?.value };
}

/** `mutation register`, or just `query` for an anonymous operation. */
export function formatGraphQLOperation({ type, name }: GraphQLOperationDescription): string {
  return name ? `${type} ${name}` : type;
}
