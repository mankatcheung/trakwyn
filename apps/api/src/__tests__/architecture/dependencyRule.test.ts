import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Clean Architecture's dependency rule, enforced rather than described.
 *
 * CLAUDE.md documents the layering; until this existed, one test guarded one
 * edge of it — the `use-cases` → `interface-adapters` check added with the
 * tool catalogue, written because that edge had just broken. Everything else
 * was on trust, and three violations accumulated.
 *
 * The rule resolves every import to the layer it lands in (JEF-256). It used
 * to ask only whether a file's text contained `from '#src/<layer>/`, which
 * decided nothing about three whole classes of import:
 *
 *   - **Root modules.** Every entry below names a layer directory, so a module
 *     at the root of `src/` was in no layer and no `mayNotImport` list could
 *     name it. `src/constants.ts` was exactly that — 795 lines of cookie
 *     policy, route paths and domain rules imported by 55 use-case files, with
 *     this test green (JEF-253). Now a root module is its own forbidden target,
 *     and `has no shared module at the root of src/` stops one existing at all.
 *   - **Relative imports.** `from '../../http/constants.js'` contains no
 *     `#src/` prefix and was invisible. There are 244 relative imports in
 *     `src/`; they are resolved against the importing file now.
 *   - **Dynamic imports.** `await import('#src/http/…')` is not `from '…'`.
 */

const SRC = join(process.cwd(), 'src');

/**
 * A module directly under `src/`, belonging to no layer. Named so it can be a
 * forbidden target like any other — a root module is unreachable inward, and
 * the check below means one should not exist in the first place.
 */
const ROOT = '(root)';

/** Dependencies point inward. Each layer lists what it may not reach for. */
const FORBIDDEN: Array<{ layer: string; mayNotImport: string[] }> = [
  {
    layer: 'domain',
    mayNotImport: ['use-cases', 'interface-adapters', 'infrastructure', 'http', 'seed', ROOT],
  },
  {
    layer: 'use-cases',
    mayNotImport: ['interface-adapters', 'infrastructure', 'http', 'seed', ROOT],
  },
  { layer: 'interface-adapters', mayNotImport: ['infrastructure', 'http', 'seed', ROOT] },
];

/**
 * Entrypoints, not shared modules: each is a program the process starts at,
 * and nothing imports them for their exports. They are the only files allowed
 * to sit at the root of `src/`.
 */
// copyFromTurso.ts is the one-off JEF-342 data copy; it goes when Turso is retired.
const ROOT_ENTRYPOINTS = ['index.ts', 'migrate.ts', 'seed.ts', 'copyFromTurso.ts'];

/**
 * Frameworks belong at the edges. A domain entity or a use case that imports
 * Drizzle or Fastify has stopped being testable without them, which is the
 * practical cost the rule exists to prevent.
 */
const FRAMEWORKS = [
  'drizzle-orm',
  'fastify',
  'graphql',
  '@pothos/',
  'pg',
  '@electric-sql/',
  '@libsql/',
  'web-push',
];
const FRAMEWORK_FREE = ['domain', 'use-cases'];

/**
 * Escape hatch for a violation that cannot be fixed immediately: the path,
 * mapped to the ticket that clears it.
 *
 * It may only shrink. A separate check below fails when an entry stops being
 * a violation, so a fix cannot leave its exemption behind — which is how a
 * list like this usually turns permanent.
 */
const KNOWN_VIOLATIONS: Record<string, string> = {
  // Empty, and worth keeping that way. The fourteen this shipped with were
  // cleared by JEF-181 and JEF-182 before it merged.
};

function sourceFiles(layer: string): string[] {
  const root = join(SRC, layer);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__') walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/** Layer-relative path with forward slashes, so the allow-list reads the same everywhere. */
const idOf = (file: string): string => relative(SRC, file).split(sep).join('/');

/**
 * Every module specifier in a file, in all three forms it can take:
 * `import`/`export … from '…'`, the side-effect `import '…'`, and the dynamic
 * `import('…')`. A rule that reads only some of them is a rule with a way
 * around it — the side-effect form was the last one missing, and it slipped
 * through the first draft of this very test.
 */
function specifiersIn(contents: string): string[] {
  const patterns = [/from\s*'([^']+)'/g, /\bimport\s+'([^']+)'/g, /\bimport\(\s*'([^']+)'\s*\)/g];

  return patterns.flatMap((pattern) =>
    [...contents.matchAll(pattern)].map((match) => match[1] as string),
  );
}

/**
 * Which layer a specifier lands in, or `null` for a bare package (the
 * framework check covers those) or anything resolving outside `src/`.
 */
function layerOf(specifier: string, importingFile: string): string | null {
  let withinSrc: string;

  if (specifier.startsWith('#src/')) {
    withinSrc = specifier.slice('#src/'.length);
  } else if (specifier.startsWith('.')) {
    const target = resolve(dirname(importingFile), specifier);
    const rel = relative(SRC, target).split(sep).join('/');
    if (rel.startsWith('..')) return null;
    withinSrc = rel;
  } else {
    return null;
  }

  const segments = withinSrc.split('/');
  // One segment means the specifier names a file sitting directly under src/.
  return segments.length > 1 ? (segments[0] as string) : ROOT;
}

function offendersIn(layer: string, mayNotImport: string[]): string[] {
  return sourceFiles(layer)
    .filter((file) =>
      specifiersIn(readFileSync(file, 'utf8')).some((specifier) => {
        const target = layerOf(specifier, file);
        return target !== null && mayNotImport.includes(target);
      }),
    )
    .map(idOf);
}

describe('the dependency rule', () => {
  it.each(FORBIDDEN)('$layer does not import $mayNotImport', ({ layer, mayNotImport }) => {
    const offenders = offendersIn(layer, mayNotImport).filter((id) => !(id in KNOWN_VIOLATIONS));

    expect(offenders).toEqual([]);
  });

  it.each(FRAMEWORK_FREE)('%s imports no framework', (layer) => {
    const offenders = sourceFiles(layer)
      .filter((file) => {
        const contents = readFileSync(file, 'utf8');
        return FRAMEWORKS.some((fw) => contents.includes(`from '${fw}`));
      })
      .map(idOf);

    expect(offenders).toEqual([]);
  });

  /**
   * The rule above can only judge an import that lands in a layer. A module at
   * the root of `src/` is in none, so it is reachable from everywhere and
   * accountable to nothing — which is how one file came to hold cookie policy
   * and domain rules together (JEF-253). Keeping the root empty is what makes
   * the matrix above complete by construction.
   */
  it('has no shared module at the root of src/', () => {
    const rootModules = readdirSync(SRC)
      .filter((entry) => !statSync(join(SRC, entry)).isDirectory())
      .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
      .filter((entry) => !ROOT_ENTRYPOINTS.includes(entry));

    expect(rootModules).toEqual([]);
  });

  it('walked a realistic number of files', () => {
    // A wrong working directory would walk nothing and pass everything above.
    const counted = FORBIDDEN.reduce((n, { layer }) => n + sourceFiles(layer).length, 0);

    expect(counted).toBeGreaterThan(300);
  });

  /**
   * The companion to the count above: the walk can find every file and still
   * decide nothing if the specifier regex stops matching. That failure is
   * silent — every check goes green — so it is asserted rather than assumed.
   */
  it('resolves a realistic number of imports to a layer', () => {
    const resolved = FORBIDDEN.flatMap(({ layer }) => sourceFiles(layer)).flatMap((file) =>
      specifiersIn(readFileSync(file, 'utf8'))
        .map((specifier) => layerOf(specifier, file))
        .filter((target): target is string => target !== null),
    );

    expect(resolved.length).toBeGreaterThan(800);
  });

  it('has no stale entries in the known-violations list', () => {
    const stillViolating = new Set(
      FORBIDDEN.flatMap(({ layer, mayNotImport }) => offendersIn(layer, mayNotImport)),
    );

    // The point of this one: once a fix lands, its exemption has to go with
    // it. Without this the list only ever grows and quietly becomes the
    // architecture.
    const fixed = Object.keys(KNOWN_VIOLATIONS).filter((id) => !stillViolating.has(id));

    expect(fixed).toEqual([]);
  });
});
