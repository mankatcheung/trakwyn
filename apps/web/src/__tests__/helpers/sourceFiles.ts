import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** `apps/web`. */
export const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');

const SOURCE_ROOTS = [join(WEB_ROOT, 'src'), join(WEB_ROOT, '..', '..', 'packages', 'ui', 'src')];
const SOURCE_FILE = /\.(ts|tsx|css)$/;
/** Tests, stories and generated code describe or mock UI rather than render it. */
const EXEMPT = /(__tests__|graphql[\\/]generated|\.test\.|\.stories\.|routeTree\.gen)/;

/**
 * Every source file the app ships, from `apps/web/src` and `packages/ui/src`, whatever its
 * extension. The design guard tests (no gray classes, no sparkle icons) read these, so a sweep
 * cannot miss a file type (JEF-693).
 */
export function appSourceFiles(): string[] {
  return SOURCE_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((path) => SOURCE_FILE.test(path) && !EXEMPT.test(path))
      .map((path) => join(root, path)),
  );
}

/** `path:line  text` for every line of `files` that matches `pattern`. */
export function matchingLines(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(line) ? [`${relative(WEB_ROOT, file)}:${index + 1}  ${line.trim()}`] : [],
      ),
  );
}
