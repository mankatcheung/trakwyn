import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The app's neutrals are the warm `stone` ramp, never the cool `gray` one
 * (JEF-671, JEF-693). The JEF-671 sweep covered `.tsx` files only, so two `.ts`
 * files kept `gray-*` classes (`statusColors.ts`, `llmProviders.ts`) and the
 * Draft status stayed cool next to stone surfaces. This test reads every source
 * file of `apps/web` and `packages/ui`, whatever its extension, so the next
 * sweep cannot miss a file type.
 *
 * Tests, stories and generated code are exempt: they describe or mock classes
 * rather than render them.
 */
const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const SOURCE_ROOTS = [join(WEB_ROOT, 'src'), join(WEB_ROOT, '..', '..', 'packages', 'ui', 'src')];

const SOURCE_FILE = /\.(ts|tsx|css)$/;
const EXEMPT = /(__tests__|graphql[\\/]generated|\.test\.|\.stories\.|routeTree\.gen)/;
/** `bg-gray-400`, `dark:text-gray-300`, `border-t-gray-400`, and the typography plugin's `prose-gray`. */
const GRAY_CLASS = /\bgray-\d{2,3}\b|\bprose-gray\b/;

function sourceFiles(): string[] {
  return SOURCE_ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((path) => SOURCE_FILE.test(path) && !EXEMPT.test(path))
      .map((path) => join(root, path)),
  );
}

describe('no gray classes (JEF-693)', () => {
  const files = sourceFiles();

  it('reads the source of both packages', () => {
    // A wrong root would read nothing and pass for the wrong reason.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((file) => file.endsWith('statusColors.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith(join('ui', 'src', 'Button.tsx')))).toBe(true);
  });

  it('uses stone, never gray, for neutrals in every source file', () => {
    const found = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          GRAY_CLASS.test(line) ? [`${relative(WEB_ROOT, file)}:${index + 1}  ${line.trim()}`] : [],
        ),
    );

    expect(found).toEqual([]);
  });
});
