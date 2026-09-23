import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  UNMATCHED_ROUTE,
  resetRouteResolverForTests,
  templatePath,
} from '#/lib/analytics/routeTemplate';
import { getRouter } from '#/router';

const APPLICATION_ID = 'V1StGXR8_Z5jdHi6B-myT';
const DRAFT_ID = 'Uakgb_J5m9g-0JDMbcJqL';

/**
 * The same templating against the real route tree (JEF-360). routeTemplate.test.ts
 * pins the module's behaviour with a stand-in resolver; this pins the
 * assumptions that stand-in makes about `getMatchedRoutes` — that static
 * siblings beat a param, that the pathless `_authenticated` layout does not
 * appear, and that an unknown path matches nothing — so a router upgrade
 * that changes any of them fails here rather than in PostHog.
 */
describe('route templating against the real router', () => {
  beforeAll(() => {
    getRouter();
  });

  afterAll(() => resetRouteResolverForTests());

  it.each([
    [`/applications/${APPLICATION_ID}`, '/applications/$applicationId'],
    [`/applications/${APPLICATION_ID}/edit`, '/applications/$applicationId/edit'],
    [
      `/applications/${APPLICATION_ID}/documents/${DRAFT_ID}`,
      '/applications/$applicationId/documents/$draftId',
    ],
    [`/applications/${APPLICATION_ID}/documents/new`, '/applications/$applicationId/documents/new'],
    ['/applications/board', '/applications/board'],
    ['/applications/trash', '/applications/trash'],
    ['/applications', '/applications'],
    ['/dashboard', '/dashboard'],
    ['/', '/'],
  ])('reports %s as %s', (pathname, template) => {
    expect(templatePath(pathname)).toBe(template);
  });

  it('reports a path no route matches as unmatched', () => {
    expect(templatePath(`/applications/${APPLICATION_ID}/no-such-tab/x`)).toBe(UNMATCHED_ROUTE);
  });
});
