import { posix } from 'node:path';
import ts from 'typescript';

const ALIAS_PREFIX = '#/';
const ALIAS_ROOT = 'src';
const PROBE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.graphql'];

type Literal = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;

function isLiteral(node: ts.Node | undefined): node is Literal {
  return (
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  );
}

/** The string literal that names a module in this node, if it is an import-like form. */
function specifierLiteral(node: ts.Node): Literal | null {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    isLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    isLiteral(node.argument.literal)
  ) {
    return node.argument.literal;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    isLiteral(node.arguments[0])
  ) {
    return node.arguments[0];
  }
  return null;
}

/** Every module specifier a file names through `import`, `export … from`, `import()` or an `import()` type. */
export function listSpecifiers(code: string, fileName: string): string[] {
  const kind =
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const literal = specifierLiteral(node);
    if (literal) found.push(literal.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * The file a `#/` or relative specifier points at, as a path relative to `apps/web`
 * (`src/lib/x.ts`), or null for a package or anything that does not resolve.
 */
export function resolveImportTarget(
  specifier: string,
  fromDir: string,
  isFile: (path: string) => boolean,
): string | null {
  const isAlias = specifier.startsWith(ALIAS_PREFIX);
  if (!isAlias && !specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const [path = ''] = specifier.split('?');
  const joined = isAlias
    ? posix.join(ALIAS_ROOT, path.slice(ALIAS_PREFIX.length))
    : posix.join(fromDir, path);
  const candidates = [
    joined,
    ...PROBE_EXTENSIONS.map((ext) => joined + ext),
    ...PROBE_EXTENSIONS.map((ext) => posix.join(joined, `index${ext}`)),
  ];
  return candidates.find(isFile) ?? null;
}
