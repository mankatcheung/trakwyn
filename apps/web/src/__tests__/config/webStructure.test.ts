import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnv } from '../../../scripts/lib/createEnv.ts';
import { parseMapping } from '../../../scripts/lib/mapping.ts';
import { listSpecifiers } from '../../../scripts/lib/rewriteTypeScript.ts';
import { resolveSpecifierTarget } from '../../../scripts/lib/resolveSpecifier.ts';

/**
 * The web app's folder layout, enforced rather than described (JEF-627, JEF-628).
 *
 * `src/` is moving from "one folder per kind of file" to one folder per feature
 * (`features/<name>/{pages,components,hooks,lib,graphql}`), the way `apps/mobile`
 * is laid out. The move happens in phases, so the rules below hold on every
 * branch along the way:
 *
 *   - `scripts/restructure-mapping.tsv` names every file and where it ends up.
 *     The files still at their old path are the only ones allowed to sit in a
 *     per-kind folder, and that list can only shrink.
 *   - A route reaches a feature only through its `pages/`.
 *   - The shared root (what stays in `components/`, `hooks/`, `lib/` …) never
 *     imports a feature.
 *   - A feature folder has no `index.ts` barrel.
 */

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(WEB_ROOT, 'src');

/**
 * How many files are still at an old path. Lower it in the PR that moves files;
 * it must reach 0, and a new file in an old location can never raise it.
 */
const STILL_IN_OLD_LOCATIONS = 379;

/**
 * Route files that reach into a feature's `components/` or `lib/` instead of its
 * `pages/`. Phase 2 moved those files without touching the routes, so each import
 * is named here. The list can only shrink: a route that gets its own page drops its
 * entries, and a new route import of a feature internal is a failure.
 */
const ROUTE_IMPORTS_OF_FEATURE_INTERNALS = new Set([
  'routes/__root.tsx imports features/legal/components/CookieConsent.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/quota/components/QuotaHint.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/plans/components/UpgradePrompt.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/quota/lib/contentQuota.ts',
  'routes/_authenticated/profile/index.tsx imports features/auth/lib/returnTo.ts',
  'routes/_authenticated/route.tsx imports features/auth/lib/sessionGate.ts',
  'routes/account-deletion-scheduled.tsx imports features/verification/lib/emailVerification.ts',
  'routes/guides/$slug.tsx imports features/guides/lib/guideFeeds.ts',
  'routes/guides/$slug.tsx imports features/guides/lib/guides.ts',
  'routes/guides/rss[.]xml.ts imports features/guides/lib/guideFeeds.ts',
  'routes/guides/rss[.]xml.ts imports features/guides/lib/guides.ts',
  'routes/index.tsx imports features/marketing/components/MarketingHeader.tsx',
  'routes/index.tsx imports features/marketing/components/MarketingFooter.tsx',
  'routes/index.tsx imports features/marketing/components/AiDemoSection.tsx',
  'routes/index.tsx imports features/marketing/components/ClipperSection.tsx',
  'routes/index.tsx imports features/marketing/components/FeatureRow.tsx',
  'routes/index.tsx imports features/marketing/components/ThemedScreenshot.tsx',
  'routes/index.tsx imports features/marketing/components/FaqSection.tsx',
  'routes/login.tsx imports features/auth/lib/returnTo.ts',
  'routes/sitemap[.]xml.ts imports features/guides/lib/guideFeeds.ts',
  'routes/sitemap[.]xml.ts imports features/guides/lib/guides.ts',
  'routes/verify-email-required.tsx imports features/verification/lib/emailVerification.ts',
]);

/**
 * Shared-root files that import a feature. `ErrorState` stays shared and renders the
 * plan upgrade prompt. The list can only shrink.
 */
const ROOT_IMPORTS_OF_FEATURES = new Set([
  'components/ErrorState.tsx imports features/plans/components/UpgradePrompt.tsx',
]);

/** Folders that held files by kind. A file here must be named in the mapping. */
const PER_KIND_FOLDERS = [
  'components/',
  'hooks/',
  'lib/',
  'graphql/queries/',
  'graphql/mutations/',
  '__tests__/components/',
  '__tests__/hooks/',
  '__tests__/lib/',
];

function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

const files = walk(SRC);
const fileSet = new Set(files);
const rows = parseMapping(
  readFileSync(join(WEB_ROOT, 'scripts', 'restructure-mapping.tsv'), 'utf8'),
);
const env = createEnv(
  files.map((file) => `apps/web/src/${file}`),
  rows,
);

const oldLocations = new Set(
  rows.filter((row) => row.from !== row.to && fileSet.has(row.from)).map((row) => row.from),
);
const mapped = new Set(rows.flatMap((row) => [row.from, row.to]));

const isCode = (file: string) => /\.tsx?$/.test(file);
const isTest = (file: string) => file.split('/').includes('__tests__');
const isGenerated = (file: string) =>
  file.startsWith('graphql/generated/') || file === 'routeTree.gen.ts';

function importTargets(file: string): string[] {
  const code = readFileSync(join(SRC, file), 'utf8');
  const fromDir = `src/${file.split('/').slice(0, -1).join('/')}`.replace(/\/$/, '');
  return listSpecifiers(code, file)
    .map((specifier) => resolveSpecifierTarget(specifier, fromDir, env))
    .filter((target): target is string => target !== null && target.startsWith('src/'))
    .map((target) => target.slice('src/'.length));
}

describe('web src structure', () => {
  it('has every file in the mapping at exactly one of its two paths', () => {
    const broken = rows
      .filter((row) => row.from !== row.to)
      .filter((row) => fileSet.has(row.from) === fileSet.has(row.to))
      .map((row) => `${row.from} -> ${row.to}`);

    expect(broken, 'a mapped file is missing, or exists at both paths').toEqual([]);
  });

  it('puts no new file in a per-kind folder', () => {
    const strays = files.filter(
      (file) => PER_KIND_FOLDERS.some((folder) => file.startsWith(folder)) && !mapped.has(file),
    );

    expect(
      strays,
      'put a feature file under features/<name>/…; a file that is truly shared needs a row (old path = new path) in scripts/restructure-mapping.tsv',
    ).toEqual([]);
  });

  it('only lets the list of files in old locations shrink', () => {
    expect(
      oldLocations.size,
      'a file was added to an old location; put it under features/<name>/ instead',
    ).toBeLessThanOrEqual(STILL_IN_OLD_LOCATIONS);
  });

  it('keeps STILL_IN_OLD_LOCATIONS equal to the real count', () => {
    expect(
      oldLocations.size,
      'files moved: lower STILL_IN_OLD_LOCATIONS in this test to the new count',
    ).toBe(STILL_IN_OLD_LOCATIONS);
  });

  it('lets a route reach a feature only through its pages/', () => {
    const offenders = files
      .filter((file) => file.startsWith('routes/') && isCode(file) && !isTest(file))
      .filter((file) => !file.split('/').some((segment) => segment.startsWith('-')))
      .flatMap((file) =>
        importTargets(file)
          .filter((target) => target.startsWith('features/'))
          .filter((target) => !/^features\/[^/]+\/pages\//.test(target))
          .map((target) => `${file} imports ${target}`),
      );

    expect(
      offenders.filter((offender) => !ROUTE_IMPORTS_OF_FEATURE_INTERNALS.has(offender)),
      'route files import a feature page; the page imports the rest',
    ).toEqual([]);
    expect(
      [...ROUTE_IMPORTS_OF_FEATURE_INTERNALS].filter((entry) => !offenders.includes(entry)),
      'an exemption no longer applies: remove it from ROUTE_IMPORTS_OF_FEATURE_INTERNALS',
    ).toEqual([]);
  });

  it('never lets the shared root import a feature', () => {
    const offenders = files
      .filter((file) => isCode(file) && !isTest(file) && !isGenerated(file))
      .filter((file) => !file.startsWith('features/') && !file.startsWith('routes/'))
      .filter((file) => !oldLocations.has(file))
      .flatMap((file) =>
        importTargets(file)
          .filter((target) => target.startsWith('features/'))
          .map((target) => `${file} imports ${target}`),
      );

    expect(
      offenders.filter((offender) => !ROOT_IMPORTS_OF_FEATURES.has(offender)),
      'features depend on the shared root, never the other way round',
    ).toEqual([]);
    expect(
      [...ROOT_IMPORTS_OF_FEATURES].filter((entry) => !offenders.includes(entry)),
      'an exemption no longer applies: remove it from ROOT_IMPORTS_OF_FEATURES',
    ).toEqual([]);
  });

  it('has no index.ts barrel inside a feature', () => {
    const barrels = files.filter((file) => /^features\/.+\/index\.tsx?$/.test(file));

    expect(barrels, 'import from the file that defines it').toEqual([]);
  });
});
