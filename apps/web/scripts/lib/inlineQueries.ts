/**
 * The one inline GraphQL string left in the web app (JEF-646): the client's own
 * token-refresh call. Routing it through the generated documents would make the
 * client depend on its own output. Keyed by file (relative to `src/`) and constant.
 */
export const INLINE_QUERY_EXCEPTIONS: readonly string[] = ['graphql/client.ts REFRESH_MUTATION'];

/** A template literal that opens with an operation keyword. */
const OPERATION_LITERAL = /`\s*(?:query|mutation|subscription)\b/g;

export interface SourceFile {
  /** Path relative to `src/`. */
  id: string;
  code: string;
}

/**
 * Inline GraphQL strings: a template literal that opens with `query`, `mutation` or
 * `subscription` and is not the argument of `graphql(`, such as
 * `const X_QUERY = \`query …\``. Each is reported as `<file> <CONSTANT>`, or
 * `<file> <inline>` when it is not assigned to a name, except the named exceptions.
 */
export function findInlineQueries(
  files: readonly SourceFile[],
  exceptions: readonly string[] = INLINE_QUERY_EXCEPTIONS,
): string[] {
  return files
    .flatMap(({ id, code: source }) => {
      const code = withoutComments(source);
      return [...code.matchAll(OPERATION_LITERAL)]
        .map((match) => code.slice(0, match.index))
        .filter((before) => !/graphql\(\s*$/.test(before))
        .map((before) => `${id} ${/(\w+)\s*=\s*$/.exec(before)?.[1] ?? '<inline>'}`);
    })
    .filter((entry) => !exceptions.includes(entry));
}

/** Comments mention `query` in backticks; blank them so only code is scanned. */
function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}
