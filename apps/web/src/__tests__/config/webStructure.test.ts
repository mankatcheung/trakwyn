import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFeatureStrays } from '../../../scripts/lib/featureLayout.ts';
import { findHandRolledGqlMocks } from '../../../scripts/lib/handRolledGqlMocks.ts';
import { findInlineQueries } from '../../../scripts/lib/inlineQueries.ts';
import { listSpecifiers, resolveImportTarget } from '../../../scripts/lib/listImports.ts';

/**
 * The web app's folder layout, enforced rather than described (JEF-627).
 *
 * `src/` is one folder per feature (`features/<name>/{pages,components,hooks,lib,graphql}`),
 * the way `apps/mobile` is laid out. The rules:
 *
 *   - A feature holds only `pages`, `components`, `hooks`, `lib`, `graphql`,
 *     `__tests__` and a `CLAUDE.md`.
 *   - A route reaches a feature only through its `pages/`, or its `graphql/` (a loader
 *     needs the query options).
 *   - A feature never imports `routes/`. A page reads its params and search
 *     through `getRouteApi('<route id>')`, not by importing the route file.
 *   - The shared root (what stays in `components/`, `hooks/`, `lib/` …) never
 *     imports a feature.
 *   - A feature folder has no `index.ts` barrel.
 *   - A source file is at most 400 lines, the same limit as `apps/api`'s `fileSize.test.ts`,
 *     with no exceptions (JEF-636).
 *   - No GraphQL string is written inline: every document is a typed `graphql()` call
 *     (JEF-637), except the client's own `REFRESH_MUTATION`.
 *   - A test answers a mocked `gqlClient` with `mockGql`/`respond`, not a hand-rolled
 *     `gqlText(query).includes(…)` (JEF-652).
 */

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(WEB_ROOT, 'src');

/**
 * Shared-root files that import a feature. `ErrorState` stays shared and renders the
 * plan upgrade prompt. The list can only shrink.
 */
const ROOT_IMPORTS_OF_FEATURES = new Set([
  'components/ErrorState.tsx imports features/plans/components/UpgradePrompt.tsx',
]);

/**
 * Tests still answering a mocked `gqlClient` by hand, moved onto `mockGql` folder by
 * folder (JEF-652). The list can only shrink: a file that no longer matches must come off.
 */
const HAND_ROLLED_GQL_MOCKS = new Set<string>([
  'features/application-detail/components/tabs/__tests__/CompanyBriefingTab.test.tsx',
  'features/application-detail/components/tabs/__tests__/ContactsTab.test.tsx',
  'features/application-detail/pages/__tests__/ApplicationDetailPage.test.tsx',
  'features/application-detail/pages/__tests__/ApplicationDetailSectionSwitch.test.tsx',
  'features/applications/pages/__tests__/ApplicationsPage.test.tsx',
  'features/applications/pages/__tests__/TrashPage.test.tsx',
  'features/chat/components/__tests__/ChatConversationView.test.tsx',
  'features/chat/lib/__tests__/ConversationListProvider.test.tsx',
  'features/chat/pages/__tests__/AssistantChatPage.test.tsx',
  'features/chat/pages/__tests__/AssistantHistoryPage.test.tsx',
  'features/documents/components/__tests__/AiHelperPanel.test.tsx',
  'features/documents/components/__tests__/DocumentList.test.tsx',
  'features/documents/components/__tests__/DraftHistoryPanel.test.tsx',
  'features/documents/components/__tests__/EmptyProfilePrompt.test.tsx',
  'features/documents/components/__tests__/ImportDocumentAction.test.tsx',
  'features/documents/components/__tests__/ResumeSourcePicker.test.tsx',
  'features/documents/components/review/__tests__/ResumeAtsPanel.test.tsx',
  'features/documents/components/review/__tests__/ResumeGapsPanel.test.tsx',
  'features/documents/components/review/__tests__/ResumeMatchPanel.test.tsx',
  'features/documents/hooks/__tests__/useCreateOrOpenDraft.test.tsx',
  'features/documents/hooks/__tests__/useDraftEditor.test.tsx',
  'features/documents/pages/__tests__/DocumentDraftEditPage.test.tsx',
  'features/documents/pages/__tests__/DocumentDraftSaveState.test.tsx',
  'features/interviews/components/__tests__/InterviewQuestionsPanel.test.tsx',
  'features/interviews/components/__tests__/InterviewsTab.test.tsx',
  'features/interviews/components/mock/__tests__/MockQuestionsPanel.test.tsx',
  'features/offers/pages/__tests__/ApplicationOffersPage.test.tsx',
  'features/profile/components/sections/__tests__/ProfileSections.test.tsx',
  'features/profile/components/sections/__tests__/ProfileSectionsDeleteUndo.test.tsx',
  'features/settings/components/integrations/__tests__/ApiTokensCard.test.tsx',
  'features/settings/pages/__tests__/SettingsAiPage.test.tsx',
  'features/settings/pages/__tests__/SettingsDangerZonePage.test.tsx',
]);

/** Lines above which a source file must justify itself below. */
const MAX_LINES = 400;

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

  it('lets a route reach a feature only through its pages/ and graphql/', () => {
    const offenders = files
      .filter((file) => file.startsWith('routes/') && isCode(file) && !isTest(file))
      .filter((file) => !file.split('/').some((segment) => segment.startsWith('-')))
      .flatMap((file) =>
        importTargets(file)
          .filter((target) => target.startsWith('features/'))
          .filter((target) => !/^features\/[^/]+\/(pages|graphql)\//.test(target))
          .map((target) => `${file} imports ${target}`),
      );

    expect(
      offenders,
      'route files import a feature page or its graphql documents; the page imports the rest',
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

    it(`keeps every source file to ${MAX_LINES} lines`, () => {
      expect(
        sized().map(({ id, lines }) => `${id} (${lines} lines)`),
        'split the file by what it contains',
      ).toEqual([]);
    });

    it('walked a realistic number of files', () => {
      expect(files.filter(isCode).length).toBeGreaterThan(300);
    });
  });

  describe('inline GraphQL', () => {
    it('has no inline query or mutation string except the client refresh call', () => {
      const sources = files
        .filter((file) => isCode(file) && !isTest(file) && !isGenerated(file))
        .map((id) => ({ id, code: readFileSync(join(SRC, id), 'utf8') }));

      expect(
        findInlineQueries(sources),
        'write the document as graphql(`…`) in the feature’s graphql/ folder (JEF-637)',
      ).toEqual([]);
    });

    it('flags a template literal that opens with an operation keyword', () => {
      expect(
        findInlineQueries([
          { id: 'features/x/lib/x.ts', code: 'const X_QUERY = `\n  query X { me { id } }\n`;' },
          { id: 'features/x/lib/y.ts', code: 'export const Y_MUTATION = `mutation Y { y }`;' },
          { id: 'features/x/lib/z.ts', code: 'client.request(`query Z { z }`);' },
        ]),
      ).toEqual([
        'features/x/lib/x.ts X_QUERY',
        'features/x/lib/y.ts Y_MUTATION',
        'features/x/lib/z.ts <inline>',
      ]);
    });

    it('accepts a typed document', () => {
      expect(
        findInlineQueries([
          {
            id: 'features/x/graphql/xQueries.ts',
            code: 'export const X = graphql(`query X { x }`);',
          },
          {
            id: 'features/x/graphql/yQueries.ts',
            code: 'export const Y = graphql(\n`\n query Y { y }`);',
          },
        ]),
      ).toEqual([]);
    });

    it('allows REFRESH_MUTATION in the client and nowhere else', () => {
      const code = 'const REFRESH_MUTATION = `mutation { refreshToken }`;';

      expect(findInlineQueries([{ id: 'graphql/client.ts', code }])).toEqual([]);
      expect(findInlineQueries([{ id: 'features/x/lib/x.ts', code }])).toEqual([
        'features/x/lib/x.ts REFRESH_MUTATION',
      ]);
    });
  });

  describe('typed gqlClient mocks (JEF-652)', () => {
    const tests = () =>
      files
        .filter((file) => /\.test\.tsx?$/.test(file) && !file.startsWith('__tests__/config/'))
        .map((id) => ({ id, code: readFileSync(join(SRC, id), 'utf8') }));

    it('answers a mocked gqlClient with mockGql, except the files still to move', () => {
      const offenders = findHandRolledGqlMocks(tests());

      expect(
        offenders.filter((id) => !HAND_ROLLED_GQL_MOCKS.has(id)),
        'use mockGql(request, [respond(DOCUMENT, data)]) from #/__tests__/helpers/gqlMock',
      ).toEqual([]);
      expect(
        [...HAND_ROLLED_GQL_MOCKS].filter((id) => !offenders.includes(id)),
        'already moved: remove it from HAND_ROLLED_GQL_MOCKS',
      ).toEqual([]);
    });

    it('flags a mockImplementation that matches on gqlText', () => {
      const mock = "vi.mock('#/graphql/client', () => ({}));\n";
      expect(
        findHandRolledGqlMocks([
          {
            id: 'a.test.ts',
            code: `${mock}m.mockImplementation((q) => gqlText(q).includes('A') ? 1 : 2);`,
          },
          {
            id: 'b.test.ts',
            code: `${mock}m.mockImplementation(respondWith(x));\nm.mock.calls.filter(([q]) => gqlText(q).includes('A'));`,
          },
          { id: 'c.test.ts', code: "m.mockImplementation((q) => gqlText(q).includes('A'));" },
        ]),
      ).toEqual(['a.test.ts']);
    });
  });
});
