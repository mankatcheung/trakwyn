import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appSourceFiles, matchingLines } from '../helpers/sourceFiles';

/**
 * The app's neutrals are the warm `stone` ramp, never the cool `gray` one
 * (JEF-671, JEF-693). The JEF-671 sweep covered `.tsx` files only, so two `.ts`
 * files kept `gray-*` classes (`statusColors.ts`, `llmProviders.ts`) and the
 * Draft status stayed cool next to stone surfaces. This test reads every source
 * file of `apps/web` and `packages/ui`, whatever its extension, so the next
 * sweep cannot miss a file type.
 */
/** `bg-gray-400`, `dark:text-gray-300`, `border-t-gray-400`, and the typography plugin's `prose-gray`. */
const GRAY_CLASS = /\bgray-\d{2,3}\b|\bprose-gray\b/;

describe('no gray classes (JEF-693)', () => {
  const files = appSourceFiles();

  it('reads the source of both packages', () => {
    // A wrong root would read nothing and pass for the wrong reason.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((file) => file.endsWith('statusColors.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith(join('ui', 'src', 'Button.tsx')))).toBe(true);
  });

  it('uses stone, never gray, for neutrals in every source file', () => {
    expect(matchingLines(files, GRAY_CLASS)).toEqual([]);
  });
});
