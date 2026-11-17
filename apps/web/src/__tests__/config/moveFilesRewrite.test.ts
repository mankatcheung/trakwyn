import { describe, expect, it } from 'vitest';
import { createEnv } from '../../../scripts/lib/createEnv.ts';
import type { MappingRow } from '../../../scripts/lib/mapping.ts';
import { rewriteMentions } from '../../../scripts/lib/rewriteMentions.ts';
import { rewriteTypeScript } from '../../../scripts/lib/rewriteTypeScript.ts';
import type { FileLocation } from '../../../scripts/lib/resolveSpecifier.ts';

// The tree after `git mv` has run: the moved files sit at their new paths and
// the old paths no longer exist, which is the state the rewriter works on.
const ROWS: MappingRow[] = [
  { from: 'lib/foo.ts', to: 'features/x/lib/foo.ts' },
  { from: 'components/Bar.tsx', to: 'features/x/components/Bar.tsx' },
  { from: 'lib/guides.ts', to: 'features/guides/lib/guides.ts' },
  { from: '__tests__/components/Bar.test.tsx', to: 'features/x/components/__tests__/Bar.test.tsx' },
  {
    from: '__tests__/lib/analytics/scrubParity.test.ts',
    to: 'lib/analytics/__tests__/scrubParity.test.ts',
  },
  { from: 'lib/queryClient.ts', to: 'lib/queryClient.ts' },
];

const FILES = [
  'src/features/x/lib/foo.ts',
  'src/features/x/components/Bar.tsx',
  'src/features/guides/lib/guides.ts',
  'src/features/x/components/__tests__/Bar.test.tsx',
  'src/lib/analytics/__tests__/scrubParity.test.ts',
  'src/lib/analytics/scrub.ts',
  'src/lib/queryClient.ts',
  'src/styles.css',
  'src/routes/dashboard.tsx',
  'public/og-image.png',
  'src/__tests__/setup.ts',
].map((file) => `apps/web/${file}`);

const env = createEnv(FILES, ROWS);

/** A file that did not move. */
function stays(path: string): FileLocation {
  const dir = path.slice(0, path.lastIndexOf('/'));
  return { resolveFrom: [dir], finalDir: dir };
}

/** A file this run just moved: its imports were written for `from`. */
function moved(from: string, to: string): FileLocation {
  const dir = (path: string) => path.slice(0, path.lastIndexOf('/'));
  return { resolveFrom: [dir(from), dir(to)], finalDir: dir(to) };
}

const route = stays('src/routes/dashboard.tsx');

function rewrite(code: string, location: FileLocation, file = 'file.ts'): string {
  return rewriteTypeScript(code, file, location, env);
}

describe('rewriteTypeScript', () => {
  describe('specifiers that point at a moved file', () => {
    it('rewrites a static #/ import', () => {
      expect(rewrite(`import { foo } from '#/lib/foo';`, route)).toBe(
        `import { foo } from '#/features/x/lib/foo';`,
      );
    });

    it('rewrites a relative import from a file that stays', () => {
      expect(rewrite(`import { foo } from '../lib/foo';`, route)).toBe(
        `import { foo } from '../features/x/lib/foo';`,
      );
    });

    it('rewrites export … from and export *', () => {
      const code = `export { foo } from '#/lib/foo';\nexport * from '#/components/Bar';`;
      expect(rewrite(code, route)).toBe(
        `export { foo } from '#/features/x/lib/foo';\nexport * from '#/features/x/components/Bar';`,
      );
    });

    it('rewrites a dynamic import()', () => {
      expect(rewrite(`const m = await import('#/lib/foo');`, route)).toBe(
        `const m = await import('#/features/x/lib/foo');`,
      );
    });

    it('rewrites an import() type', () => {
      expect(rewrite(`type M = typeof import('#/lib/foo');`, route)).toBe(
        `type M = typeof import('#/features/x/lib/foo');`,
      );
    });

    it.each(['mock', 'doMock', 'importActual', 'importMock', 'unmock', 'doUnmock'])(
      'rewrites vi.%s',
      (method) => {
        expect(rewrite(`vi.${method}('#/lib/foo', () => ({}));`, route)).toBe(
          `vi.${method}('#/features/x/lib/foo', () => ({}));`,
        );
      },
    );

    it('rewrites both the vi.importActual call and its generic import() type', () => {
      const code = `const a = await vi.importActual<typeof import('#/lib/foo')>('#/lib/foo');`;
      expect(rewrite(code, route)).toBe(
        `const a = await vi.importActual<typeof import('#/features/x/lib/foo')>('#/features/x/lib/foo');`,
      );
    });

    it('keeps double quotes and an extension-less style', () => {
      expect(rewrite(`import { foo } from "#/lib/foo";`, route)).toBe(
        `import { foo } from "#/features/x/lib/foo";`,
      );
    });

    it('keeps an explicit extension', () => {
      expect(rewrite(`import { foo } from '#/lib/foo.ts';`, route)).toBe(
        `import { foo } from '#/features/x/lib/foo.ts';`,
      );
    });
  });

  describe('files that move', () => {
    const testLocation = moved(
      'src/__tests__/components/Bar.test.tsx',
      'src/features/x/components/__tests__/Bar.test.tsx',
    );

    it('re-relativises a relative import to a file that stays put', () => {
      const code = `import { setup } from '../setup';`;
      const location = moved(
        'src/__tests__/components/Bar.test.tsx',
        'src/features/x/components/__tests__/Bar.test.tsx',
      );
      expect(rewrite(code, location)).toBe(`import { setup } from '../../../../__tests__/setup';`);
    });

    it('rewrites a relative import when both ends move', () => {
      expect(rewrite(`import { Bar } from '../../components/Bar';`, testLocation)).toBe(
        `import { Bar } from '../Bar';`,
      );
    });

    it('leaves the #/ alias form alone when only the importer moved', () => {
      expect(rewrite(`import { q } from '#/lib/queryClient';`, testLocation)).toBe(
        `import { q } from '#/lib/queryClient';`,
      );
    });

    it('keeps a ?url suffix', () => {
      const location = moved('src/lib/guides.ts', 'src/features/guides/lib/guides.ts');
      expect(rewrite(`import css from '../styles.css?url';`, location)).toBe(
        `import css from '../../../styles.css?url';`,
      );
    });

    it('rewrites an import.meta.glob pattern', () => {
      const location = moved('src/lib/guides.ts', 'src/features/guides/lib/guides.ts');
      const code = `const A = import.meta.glob('../../../../content/guides/en/*/index.md', { query: '?raw' });`;
      expect(rewrite(code, location)).toBe(
        `const A = import.meta.glob('../../../../../../content/guides/en/*/index.md', { query: '?raw' });`,
      );
    });
  });

  describe('resolve(import.meta.dirname, …)', () => {
    const location = moved(
      'src/__tests__/lib/analytics/scrubParity.test.ts',
      'src/lib/analytics/__tests__/scrubParity.test.ts',
    );

    it('rewrites a single relative path', () => {
      const code = `const WEB = resolve(import.meta.dirname, '../../../lib/analytics/scrub.ts');`;
      expect(rewrite(code, location)).toBe(
        `const WEB = resolve(import.meta.dirname, '../scrub.ts');`,
      );
    });

    it('rewrites a join() written as separate segments', () => {
      const deeper = moved('src/lib/guides.ts', 'src/features/guides/lib/guides.ts');
      const code = `const og = join(import.meta.dirname, '..', '..', 'public', 'og-image.png');`;
      expect(rewrite(code, deeper)).toBe(
        `const og = join(import.meta.dirname, '..', '..', '..', '..', 'public', 'og-image.png');`,
      );
    });

    it('rewrites a path that names a moved file', () => {
      const code = `const f = resolve(import.meta.dirname, '../../../lib/foo.ts');`;
      expect(rewrite(code, location)).toBe(
        `const f = resolve(import.meta.dirname, '../../../features/x/lib/foo.ts');`,
      );
    });

    it('leaves a path built from a variable alone', () => {
      const code = `const f = resolve(import.meta.dirname, ...parts);`;
      expect(rewrite(code, location)).toBe(code);
    });
  });

  describe('things it must not touch', () => {
    it('ignores package specifiers and strings that look like paths', () => {
      const code = `import React from 'react';\nconst s = '#/lib/foo';\nfoo('../lib/foo');`;
      expect(rewrite(code, route)).toBe(code);
    });

    it('leaves an unresolvable specifier alone', () => {
      const code = `import x from '#/lib/missing';`;
      expect(rewrite(code, route)).toBe(code);
    });
  });

  describe('idempotence', () => {
    it('changes nothing on a second pass', () => {
      const code = [
        `import { foo } from '#/lib/foo';`,
        `import { Bar } from '../components/Bar';`,
        `vi.mock('#/lib/foo', () => ({}));`,
        `const m = await import('#/components/Bar');`,
      ].join('\n');
      const once = rewrite(code, route);
      expect(once).not.toBe(code);
      expect(rewrite(once, route)).toBe(once);
    });

    it('fixes a moved file whose imports were left stale, then settles', () => {
      // The file is already at its new path (run on another branch), but its
      // imports still use the old layout: they resolve from where it started.
      const location: FileLocation = {
        resolveFrom: ['src/features/x/components/__tests__', 'src/__tests__/components'],
        finalDir: 'src/features/x/components/__tests__',
      };
      const stale = `import { client } from '../../lib/queryClient';`;
      const fixed = rewrite(stale, location);
      expect(fixed).toBe(`import { client } from '../../../../lib/queryClient';`);
      expect(rewrite(fixed, location)).toBe(fixed);
    });
  });
});

describe('rewriteMentions', () => {
  it('rewrites src/ and apps/web/src/ paths to a moved file', () => {
    const text = 'See `src/lib/foo.ts` and `apps/web/src/components/Bar.tsx:12`.';
    expect(rewriteMentions(text, env)).toBe(
      'See `src/features/x/lib/foo.ts` and `apps/web/src/features/x/components/Bar.tsx:12`.',
    );
  });

  it('leaves other apps, directories and files that stay alone', () => {
    const text =
      'apps/mobile/src/lib/foo.ts, `src/lib/`, src/lib/queryClient.ts, packages/ui/src/lib/foo.ts';
    expect(rewriteMentions(text, env)).toBe(text);
  });

  it('does not eat the full stop that ends a sentence', () => {
    expect(rewriteMentions('It lives in src/lib/foo.ts.', env)).toBe(
      'It lives in src/features/x/lib/foo.ts.',
    );
  });
});
