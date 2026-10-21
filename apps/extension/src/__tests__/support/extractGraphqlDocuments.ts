import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import * as ts from 'typescript';

/**
 * Finds every GraphQL document the Clipper sends (JEF-417).
 *
 * The extension hand-writes its documents as template strings in `lib/api.ts`,
 * which nothing type-checks, and a store release cannot be rolled back, only
 * replaced: a renamed field would stay broken on every installed copy until an
 * update is reviewed. Extracting them is the first half of closing that gap;
 * `graphqlDocuments.test.ts` validates them against the API's schema.
 *
 * This is a copy of apps/mobile's extractor (`__tests__/support/
 * extractGraphqlDocuments.ts`), since the apps share no package and API types
 * reach the clients through codegen. Keep the two behaviourally the same.
 *
 * Documents are read out of the TypeScript AST rather than matched with a
 * regex because a document may be assembled from a shared field list, so the
 * text that goes over the wire only exists after the interpolation is
 * resolved. An interpolation this cannot resolve is reported rather than
 * skipped: a document quietly dropped here is a document nothing validates.
 */

export interface ExtractedDocument {
  /** Path relative to the package root, e.g. src/lib/api.ts. */
  file: string;
  line: number;
  /** The operation name where the document declares one — for error messages only. */
  name: string;
  text: string;
}

export interface UnresolvedInterpolation {
  file: string;
  line: number;
  expression: string;
}

export interface ExtractionResult {
  documents: ExtractedDocument[];
  unresolved: UnresolvedInterpolation[];
}

/** A template literal is treated as GraphQL only if it says so on its first line. */
const OPERATION_START = /^\s*(query|mutation|subscription|fragment)\s/;
const OPERATION_NAME = /^\s*(?:query|mutation|subscription|fragment)\s+([A-Za-z_][A-Za-z0-9_]*)/;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '__tests__', 'dist', '.output', '.wxt']);

export function extractFromSource(file: string, sourceText: string): ExtractionResult {
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Every `const X = \`...\`` in the file, so an interpolation of X can be
  // replaced by its text. Module scope is deliberate: a document assembled
  // from something computed at runtime is not a document this can validate.
  const constants = new Map<string, ts.TemplateLiteral | ts.StringLiteral>();
  const collect = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer))
    ) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const documents: ExtractedDocument[] = [];
  const unresolved: UnresolvedInterpolation[] = [];
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  /** Returns the literal's full text, or null once an interpolation cannot be resolved. */
  const resolve = (node: ts.Node, seen: Set<string>): string | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (!ts.isTemplateExpression(node)) return null;

    let text = node.head.text;
    for (const span of node.templateSpans) {
      const reference = ts.isIdentifier(span.expression) ? span.expression.text : null;
      const target = reference && !seen.has(reference) ? constants.get(reference) : undefined;
      const resolved = reference && target ? resolve(target, new Set(seen).add(reference)) : null;
      if (resolved === null) {
        unresolved.push({
          file,
          line: lineOf(span.expression),
          expression: span.expression.getText(source),
        });
        return null;
      }
      text += resolved + span.literal.text;
    }
    return text;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isTemplateLiteral(node)) {
      // The head is enough to tell a document apart from any other template
      // string, and reading it first keeps this from resolving interpolations
      // in the other template strings in the app.
      const head = ts.isTemplateExpression(node) ? node.head.text : node.text;
      if (OPERATION_START.test(head)) {
        const text = resolve(node, new Set());
        if (text !== null) {
          documents.push({
            file,
            line: lineOf(node),
            name: OPERATION_NAME.exec(text)?.[1] ?? '(anonymous)',
            text,
          });
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return { documents, unresolved };
}

/** Walks `root` (a package directory) and extracts from every non-test source file under it. */
export function extractFromDirectory(root: string, searchRoots: string[]): ExtractionResult {
  const result: ExtractionResult = { documents: [], unresolved: [] };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
        const found = extractFromSource(relative(root, path), readFileSync(path, 'utf8'));
        result.documents.push(...found.documents);
        result.unresolved.push(...found.unresolved);
      }
    }
  };
  for (const searchRoot of searchRoots) walk(join(root, searchRoot));

  return result;
}
