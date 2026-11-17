import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFeatureStrays } from '../../../scripts/lib/featureLayout.ts';
import { listSpecifiers, resolveImportTarget } from '../../../scripts/lib/listImports.ts';

/**
 * The web app's folder layout, enforced rather than described (JEF-627).
 *
 * `src/` is one folder per feature (`features/<name>/{pages,components,hooks,lib,graphql}`),
 * the way `apps/mobile` is laid out. The rules:
 *
 *   - A feature holds only `pages`, `components`, `hooks`, `lib`, `graphql`,
 *     `__tests__` and a `CLAUDE.md`.
 *   - A route reaches a feature only through its `pages/`.
 *   - A feature never imports `routes/`. A page reads its params and search
 *     through `getRouteApi('<route id>')`, not by importing the route file.
 *   - The shared root (what stays in `components/`, `hooks/`, `lib/` …) never
 *     imports a feature.
 *   - A feature folder has no `index.ts` barrel.
 *   - A source file is at most 400 lines unless `OVERSIZED_BY_DESIGN` says why (JEF-636),
 *     the same limit and the same list as `apps/api`'s `fileSize.test.ts`.
 */

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(WEB_ROOT, 'src');

/**
 * Route files that reach into a feature's `components/` or `lib/` instead of its
 * `pages/`. Phase 2 moved those files without touching the routes, so each import
 * is named here. The list can only shrink: a route that gets its own page drops its
 * entries, and a new route import of a feature internal is a failure.
 */
const ROUTE_IMPORTS_OF_FEATURE_INTERNALS = new Set([
  'routes/_authenticated/applications/$applicationId/edit.tsx imports features/application-detail/graphql/applicationQuery.ts',
  'routes/_authenticated/applications/$applicationId/index.tsx imports features/application-detail/graphql/applicationQuery.ts',
  'routes/_authenticated/applications/$applicationId/index.tsx imports features/application-detail/lib/sections.ts',
  'routes/_authenticated/applications/board.tsx imports features/applications/graphql/boardQueries.ts',
  'routes/_authenticated/applications/index.tsx imports features/applications/graphql/applicationsPageQueries.ts',
  'routes/_authenticated/applications/trash.tsx imports features/applications/graphql/trashQueries.ts',
  'routes/__root.tsx imports features/legal/components/CookieConsent.tsx',
  'routes/__root.tsx imports features/app-shell/components/NavigationProgressBar.tsx',
  'routes/_authenticated/analytics.tsx imports features/analytics/graphql/analyticsQueries.ts',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/offers/components/OfferForm.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/offers/graphql/applicationOffersQueries.ts',
  'routes/_authenticated/assistant/history.tsx imports features/chat/lib/shared.ts',
  'routes/_authenticated/assistant/index.tsx imports features/chat/lib/shared.ts',
  'routes/_authenticated/dashboard.tsx imports features/dashboard/components/DashboardPending.tsx',
  'routes/_authenticated/dashboard.tsx imports features/dashboard/graphql/dashboardQueries.ts',
  'routes/_authenticated/offers.tsx imports features/offers/graphql/offersQueries.ts',
  'routes/_authenticated/route.tsx imports features/onboarding/lib/onboarding.ts',
  'routes/_authenticated/route.tsx imports features/app-shell/components/AuthenticatedLayout.tsx',
  'routes/_authenticated/route.tsx imports features/dashboard/graphql/dashboardQueries.ts',
  'routes/_authenticated/welcome.tsx imports features/onboarding/lib/onboarding.ts',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/quota/components/QuotaHint.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/plans/components/UpgradePrompt.tsx',
  'routes/_authenticated/applications/$applicationId/offers/index.tsx imports features/quota/lib/contentQuota.ts',
  'routes/_authenticated/profile/index.tsx imports features/auth/lib/returnTo.ts',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/cv-import/CvImportDialog.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/WorkExperienceSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/EducationSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/SkillsSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/CertificationsSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/LanguagesSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/ProjectsSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/sections/AwardsSection.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/components/CompletenessMeter.tsx',
  'routes/_authenticated/profile/index.tsx imports features/profile/lib/profileCompleteness.ts',
  'routes/_authenticated/profile/index.tsx imports features/profile/hooks/useProfileData.ts',
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

/** Lines above which a source file must justify itself below. */
const MAX_LINES = 400;

/**
 * Over the limit for now, with the reason. Unlike the API's list these are not
 * cohesive tables: each is waiting for its split in JEF-636, one PR per area,
 * and each PR removes its entries. The list can only shrink.
 */
const OVERSIZED_BY_DESIGN: Record<string, string> = {
  'features/settings/lib/shared.ts':
    'Holds the helpers for ai/, security/, integrations/ and account/ in one file named "shared". JEF-636 splits it by the subfolder that uses each part and renames the pieces.',
  'features/profile/components/cv-import/CvImportReview.tsx':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
  'features/applications/pages/ApplicationsPage.tsx':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
  'features/app-shell/components/AuthenticatedLayout.tsx':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
  'features/profile/graphql/profileQueries.ts':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
  'features/applications/pages/BoardPage.tsx':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
  'features/marketing/pages/AiMcpSetupPage.tsx':
    'Over the 400-line limit when the guard was added. JEF-636 splits it by what it contains, in the PR for its area, and removes this entry.',
};

function walk(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

const files = walk(SRC);
const fileSet = new Set(files);

const isCode = (file: string) => /\.tsx?$/.test(file);
const isTest = (file: string) => file.split('/').includes('__tests__');
const isGenerated = (file: string) =>
  file.startsWith('graphql/generated/') || file === 'routeTree.gen.ts';

function importTargets(file: string): string[] {
  const code = readFileSync(join(SRC, file), 'utf8');
  const fromDir = `src/${file.split('/').slice(0, -1).join('/')}`.replace(/\/$/, '');
  return listSpecifiers(code, file)
    .map((specifier) =>
      resolveImportTarget(specifier, fromDir, (path) => fileSet.has(path.replace(/^src\//, ''))),
    )
    .filter((target): target is string => target !== null && target.startsWith('src/'))
    .map((target) => target.slice('src/'.length));
}

describe('web src structure', () => {
  it('keeps a feature to pages, components, hooks, lib, graphql, __tests__ and CLAUDE.md', () => {
    expect(
      findFeatureStrays(files),
      'a feature folder holds only pages/, components/, hooks/, lib/, graphql/, __tests__/ and CLAUDE.md',
    ).toEqual([]);
  });

  it('flags a loose file or an unknown folder in a feature', () => {
    expect(
      findFeatureStrays([
        'features/x/pages/XPage.tsx',
        'features/x/lib/__tests__/a.test.ts',
        'features/x/CLAUDE.md',
        'features/x/helpers.ts',
        'features/x/utils/format.ts',
        'features/stray.ts',
      ]),
    ).toEqual(['features/x/helpers.ts', 'features/x/utils/format.ts', 'features/stray.ts']);
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

  it('never lets a feature import from routes/', () => {
    const offenders = files
      .filter((file) => file.startsWith('features/') && isCode(file))
      .flatMap((file) =>
        importTargets(file)
          .filter((target) => target.startsWith('routes/'))
          .map((target) => `${file} imports ${target}`),
      );

    expect(
      offenders,
      "read params and search with getRouteApi('<route id>') from @tanstack/react-router",
    ).toEqual([]);
  });

  it('never lets the shared root import a feature', () => {
    const offenders = files
      .filter((file) => isCode(file) && !isTest(file) && !isGenerated(file))
      .filter((file) => !file.startsWith('features/') && !file.startsWith('routes/'))
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

  describe('file size', () => {
    const sized = () =>
      files
        .filter((file) => isCode(file) && !isTest(file) && !isGenerated(file))
        .map((id) => ({ id, lines: readFileSync(join(SRC, id), 'utf8').split('\n').length }))
        .filter(({ lines }) => lines > MAX_LINES);

    it(`keeps every source file to ${MAX_LINES} lines unless it is listed`, () => {
      const unlisted = sized()
        .filter(({ id }) => !(id in OVERSIZED_BY_DESIGN))
        .map(({ id, lines }) => `${id} (${lines} lines)`);

      expect(unlisted, 'split the file, or add it to OVERSIZED_BY_DESIGN with a reason').toEqual(
        [],
      );
    });

    it('has no stale entries in the oversized list', () => {
      const over = new Set(sized().map(({ id }) => id));

      expect(
        Object.keys(OVERSIZED_BY_DESIGN).filter((id) => !over.has(id)),
        'the file is under the limit now: remove it from OVERSIZED_BY_DESIGN',
      ).toEqual([]);
    });

    it('gives a real reason for every exemption', () => {
      expect(
        Object.entries(OVERSIZED_BY_DESIGN)
          .filter(([, reason]) => reason.trim().length < 40)
          .map(([id]) => id),
      ).toEqual([]);
    });

    it('walked a realistic number of files', () => {
      expect(files.filter(isCode).length).toBeGreaterThan(300);
    });
  });
});
