import type { SourceFile } from './inlineQueries.ts';

/**
 * A test that mocks `#/graphql/client` and answers inside `mockImplementation(…)`
 * by matching `gqlText(query).includes('Name')` returns untyped data (JEF-652).
 * `mockGql` and `respond` (`src/__tests__/helpers/gqlMock.ts`) take the response
 * from the document's `ResultOf`, so a changed selection fails `pnpm typecheck`.
 * Call filters such as `calls.filter(([q]) => gqlText(q).includes(…))` are fine.
 */
const MOCKS_CLIENT = /vi\.mock\(\s*['"]#\/graphql\/client['"]/;

/** The text between the parentheses of each `mockImplementation(` call. */
function implementationBodies(code: string): string[] {
  const bodies: string[] = [];
  for (const match of code.matchAll(/mockImplementation(?:Once)?\(/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < code.length && depth > 0) {
      const char = code[end];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      end += 1;
    }
    bodies.push(code.slice(start, end));
  }
  return bodies;
}

/** Test files (relative to `src/`) that answer a mocked `gqlClient` by hand. */
export function findHandRolledGqlMocks(files: readonly SourceFile[]): string[] {
  return files
    .filter(({ code }) => MOCKS_CLIENT.test(code))
    .filter(({ code }) => implementationBodies(code).some((body) => /gqlText\(/.test(body)))
    .map(({ id }) => id);
}
