import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  UNMATCHED_ROUTE,
  resetRouteResolverForTests,
  setRouteResolver,
  templateEventUrls,
  templatePath,
} from '#/lib/analytics/routeTemplate';

const ORIGIN = 'http://localhost:3000';
const APPLICATION_ID = 'V1StGXR8_Z5jdHi6B-myT';
const DRAFT_ID = 'Uakgb_J5m9g-0JDMbcJqL';

/**
 * A stand-in for `router.getMatchedRoutes`, returning the `fullPath` the
 * real route tree would: static segments win over a param at the same
 * level, and index routes carry TanStack's trailing slash.
 */
function fakeResolver(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  if (segments[0] !== 'applications') {
    return segments.length === 1 && segments[0] === 'dashboard' ? '/dashboard' : undefined;
  }
  if (segments.length === 1) return '/applications/';
  if (['board', 'new', 'trash'].includes(segments[1]!)) return `/applications/${segments[1]}`;
  if (segments.length === 2) return '/applications/$applicationId/';
  if (segments[2] === 'documents' && segments[3] === 'new') {
    return '/applications/$applicationId/documents/new';
  }
  if (segments[2] === 'documents' && segments.length === 4) {
    return '/applications/$applicationId/documents/$draftId';
  }
  return undefined;
}

describe('route templating', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: ORIGIN, pathname: `/applications/${APPLICATION_ID}` },
      writable: true,
      configurable: true,
    });
    setRouteResolver(fakeResolver);
  });

  afterEach(() => resetRouteResolverForTests());

  describe('templatePath', () => {
    it('replaces an application id with its route param', () => {
      expect(templatePath(`/applications/${APPLICATION_ID}`)).toBe('/applications/$applicationId');
    });

    it('replaces nested ids', () => {
      expect(templatePath(`/applications/${APPLICATION_ID}/documents/${DRAFT_ID}`)).toBe(
        '/applications/$applicationId/documents/$draftId',
      );
    });

    it('keeps a static sibling of a param route as itself', () => {
      expect(templatePath('/applications/board')).toBe('/applications/board');
      expect(templatePath(`/applications/${APPLICATION_ID}/documents/new`)).toBe(
        '/applications/$applicationId/documents/new',
      );
    });

    it('drops the trailing slash TanStack gives index routes, except for the root', () => {
      expect(templatePath('/applications')).toBe('/applications');
      expect(templatePath('/')).toBe('/');
    });

    it('reports an unmatched path as unmatched rather than passing it through', () => {
      // A 404 under /applications/<id>/… still carries the id.
      expect(templatePath(`/applications/${APPLICATION_ID}/nope/extra`)).toBe(UNMATCHED_ROUTE);
    });

    it('fails closed when no router has registered a resolver', () => {
      resetRouteResolverForTests();
      expect(templatePath(`/applications/${APPLICATION_ID}`)).toBe(UNMATCHED_ROUTE);
    });

    it('fails closed when the resolver throws', () => {
      setRouteResolver(() => {
        throw new Error('router not ready');
      });
      expect(templatePath('/dashboard')).toBe(UNMATCHED_ROUTE);
    });
  });

  describe('templateEventUrls', () => {
    it('templates every page URL a $web_vitals event carries, and strips the query', () => {
      const pageUrl = `${ORIGIN}/applications/${APPLICATION_ID}?tab=notes#top`;
      const event = {
        event: '$web_vitals',
        properties: {
          $current_url: pageUrl,
          $pathname: `/applications/${APPLICATION_ID}`,
          $web_vitals_LCP_value: 1234,
          $web_vitals_LCP_event: {
            name: 'LCP',
            value: 1234,
            $current_url: pageUrl,
            navigationURL: pageUrl,
          },
          $web_vitals_CLS_event: { name: 'CLS', value: 0.02, $current_url: pageUrl },
        },
      };

      const result = templateEventUrls(event);
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain(APPLICATION_ID);
      expect(serialized).not.toContain('tab=notes');
      expect(result?.properties.$current_url).toBe(`${ORIGIN}/applications/$applicationId`);
      expect(result?.properties.$pathname).toBe('/applications/$applicationId');
      expect(result?.properties.$web_vitals_LCP_event).toMatchObject({
        value: 1234,
        $current_url: `${ORIGIN}/applications/$applicationId`,
        navigationURL: `${ORIGIN}/applications/$applicationId`,
      });
      expect(result?.properties.$web_vitals_LCP_value).toBe(1234);
    });

    it('templates the page URLs PostHog adds to every event, including our own route property', () => {
      const event = {
        event: '$pageview',
        properties: {
          $current_url: `${ORIGIN}/applications/${APPLICATION_ID}`,
          $referrer: `${ORIGIN}/applications/${APPLICATION_ID}/documents/${DRAFT_ID}`,
          $session_entry_url: `${ORIGIN}/applications/${APPLICATION_ID}`,
          $session_entry_pathname: `/applications/${APPLICATION_ID}`,
          $prev_pageview_pathname: `/applications/${APPLICATION_ID}/documents/${DRAFT_ID}`,
          route: `/applications/${APPLICATION_ID}`,
        },
      };

      const result = templateEventUrls(event);

      expect(JSON.stringify(result)).not.toContain(APPLICATION_ID);
      expect(result?.properties.route).toBe('/applications/$applicationId');
      expect(result?.properties.$referrer).toBe(
        `${ORIGIN}/applications/$applicationId/documents/$draftId`,
      );
    });

    it('leaves a third-party referrer and non-URL properties alone', () => {
      const event = {
        properties: {
          $referrer: 'https://www.linkedin.com/jobs/view/123',
          $referring_domain: 'www.linkedin.com',
          kind: 'route_error_boundary',
        },
      };

      expect(templateEventUrls(event)?.properties).toEqual(event.properties);
    });

    it('does not touch script URLs in exception stack frames, which source maps need', () => {
      const frame = { filename: `${ORIGIN}/assets/index-abc123.js`, lineno: 1, colno: 99 };
      const event = {
        event: '$exception',
        properties: { $exception_list: [{ stacktrace: { frames: [frame] } }] },
      };

      expect(templateEventUrls(event)?.properties.$exception_list).toEqual([
        { stacktrace: { frames: [frame] } },
      ]);
    });

    it('returns a new event rather than mutating the one it was given', () => {
      const properties = { $current_url: `${ORIGIN}/applications/${APPLICATION_ID}` };
      const event = { properties };

      const result = templateEventUrls(event);

      expect(result).not.toBe(event);
      expect(properties.$current_url).toContain(APPLICATION_ID);
    });

    it('passes null and property-less events straight through', () => {
      expect(templateEventUrls(null)).toBeNull();
      const bare = { event: '$opt_in', properties: undefined };
      expect(templateEventUrls(bare)).toBe(bare);
    });
  });
});
