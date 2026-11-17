import ts from 'typescript';
import {
  rewriteDirnamePath,
  rewriteGlobPattern,
  rewriteSpecifier,
  type FileLocation,
  type RewriteEnv,
} from './resolveSpecifier.ts';

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Vitest module APIs whose first argument is a module specifier. */
const MODULE_CALLS = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
]);
const VITEST_NAMESPACES = new Set(['vi', 'vitest']);
const PATH_CALLS = new Set(['resolve', 'join']);
const DIRNAME_EXPRESSIONS = new Set(['import.meta.dirname', '__dirname']);

type Literal = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral;

function isLiteral(node: ts.Node | undefined): node is Literal {
  return (
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  );
}

/** The text between the quotes: the only part an edit may touch. */
function innerRange(node: Literal, sf: ts.SourceFile): [number, number] {
  return [node.getStart(sf) + 1, node.getEnd() - 1];
}

function isModuleCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    VITEST_NAMESPACES.has(callee.expression.text) &&
    MODULE_CALLS.has(callee.name.text)
  );
}

function isGlobCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'glob' &&
    ts.isMetaProperty(callee.expression)
  );
}

function isDirnameJoin(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : '';
  const first = node.arguments[0];
  return (
    PATH_CALLS.has(name) &&
    first !== undefined &&
    DIRNAME_EXPRESSIONS.has(first.getText(sf)) &&
    node.arguments.length > 1 &&
    node.arguments.slice(1).every(isLiteral)
  );
}

function specifierEdit(
  literal: Literal,
  sf: ts.SourceFile,
  location: FileLocation,
  env: RewriteEnv,
): Edit[] {
  const { next } = rewriteSpecifier(literal.text, location, env);
  if (next === null) return [];
  const [start, end] = innerRange(literal, sf);
  return [{ start, end, text: next }];
}

function globEdits(node: ts.CallExpression, sf: ts.SourceFile, location: FileLocation): Edit[] {
  const first = node.arguments[0];
  const candidates: readonly ts.Node[] =
    first !== undefined && ts.isArrayLiteralExpression(first)
      ? first.elements
      : first
        ? [first]
        : [];
  const literals = candidates.filter(isLiteral);
  return literals.flatMap((literal) => {
    const next = rewriteGlobPattern(literal.text, location);
    if (next === null) return [];
    const [start, end] = innerRange(literal, sf);
    return [{ start, end, text: next }];
  });
}

function dirnameEdits(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  location: FileLocation,
  env: RewriteEnv,
): Edit[] {
  const literals = node.arguments.slice(1).filter(isLiteral);
  const next = rewriteDirnamePath(
    literals.map((literal) => literal.text),
    location,
    env,
  );
  if (next === null) return [];
  const quote = literals[0]!.getText(sf)[0]!;
  const first = literals[0]!;
  const last = literals[literals.length - 1]!;
  return [
    {
      start: first.getStart(sf),
      end: last.getEnd(),
      text: next.map((segment) => `${quote}${segment}${quote}`).join(', '),
    },
  ];
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
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    isLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    isLiteral(node.argument.literal)
  ) {
    return node.argument.literal;
  }
  if (ts.isCallExpression(node) && isModuleCall(node) && isLiteral(node.arguments[0])) {
    return node.arguments[0];
  }
  return null;
}

function editsFor(
  node: ts.Node,
  sf: ts.SourceFile,
  location: FileLocation,
  env: RewriteEnv,
): Edit[] {
  const literal = specifierLiteral(node);
  if (literal) return specifierEdit(literal, sf, location, env);
  if (!ts.isCallExpression(node)) return [];
  if (isGlobCall(node)) return globEdits(node, sf, location);
  if (isDirnameJoin(node, sf)) return dirnameEdits(node, sf, location, env);
  return [];
}

function scriptKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
}

function applyEdits(code: string, edits: readonly Edit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end), code);
}

/**
 * Rewrite every module specifier in one TypeScript/JavaScript file: static
 * `import`/`export … from`, `import()`, `import('…')` types, the `vi.*` module
 * helpers, `import.meta.glob` patterns, and `resolve`/`join(import.meta.dirname,
 * '…')` paths. Returns the code unchanged when nothing needs to move.
 */
export function rewriteTypeScript(
  code: string,
  fileName: string,
  location: FileLocation,
  env: RewriteEnv,
): string {
  const sf = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const edits: Edit[] = [];
  const visit = (node: ts.Node): void => {
    edits.push(...editsFor(node, sf, location, env));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edits.length === 0 ? code : applyEdits(code, edits);
}

/** Every module specifier a file names through an import-like form (not globs or path joins). */
export function listSpecifiers(code: string, fileName: string): string[] {
  const sf = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const literal = specifierLiteral(node);
    if (literal) found.push(literal.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
