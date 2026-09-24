/**
 * Replaces page URLs on outgoing PostHog events with the route they matched
 * (JEF-360), so `/applications/V1StGXR8…` is reported as
 * `/applications/$applicationId`.
 *
 * Two reasons, one per consumer. Web vitals are only useful grouped by
 * route — p75 LCP over a thousand distinct application URLs is a thousand
 * one-sample series. And an application id is a stable handle on one
 * person's job search; the scrubber (scrub.ts) removes query strings but has
 * no way to know which path segment is an identifier. The mobile app gets the
 * same result from `useSegments()`.
 *
 * The template comes from the router itself (`getMatchedRoutes`) rather than
 * a pattern guessing which segments look like ids: `/applications/board`
 * and `/applications/<id>` sit at the same depth, and only the route tree
 * knows which one is a param. `router.tsx` registers the resolver.
 *
 * It fails closed — a path the router cannot match, or any path before a
 * resolver is registered, is reported as `UNMATCHED_ROUTE` rather than
 * passed through, because a 404 under `/applications/<id>/…` still carries
 * the id.
 *
 * Only keys known to hold the *page's* URL are rewritten. Exception stack
 * frames also carry same-origin URLs, but those name scripts under
 * `/assets/`, and rewriting them would break source-map resolution.
 */

/** Path-shaped, so a templated URL still reads as one: `https://www.trakwyn.com/[unmatched]`. */
export const UNMATCHED_ROUTE = '/[unmatched]';

/** Returns the matched route's `fullPath` for a pathname, or `undefined` when nothing matches. */
export type RouteResolver = (pathname: string) => string | undefined;

/** Properties holding a full page URL — PostHog's own, plus the web-vitals metric's `navigationURL`. */
const PAGE_URL_KEYS = new Set([
  '$current_url',
  '$referrer',
  '$session_entry_url',
  '$session_entry_referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$prev_pageview_url',
  'navigationURL',
]);

/** `$pathname`, `$session_entry_pathname`, `$prev_pageview_pathname`, … plus the `route` analytics.ts attaches. */
const PATHNAME_KEY_PATTERN = /(?:^route|pathname)$/i;

/** Each web-vitals metric is nested under `$web_vitals_<METRIC>_event` with its own copy of the URL. */
const WEB_VITALS_METRIC_KEY_PATTERN = /^\$web_vitals_[A-Z]+_event$/;

let resolveRoute: RouteResolver | null = null;

export function setRouteResolver(resolver: RouteResolver): void {
  resolveRoute = resolver;
}

/** Maps a pathname to its route template, e.g. `/applications/abc` → `/applications/$applicationId`. */
export function templatePath(pathname: string): string {
  let fullPath: string | undefined;
  try {
    fullPath = resolveRoute?.(pathname);
  } catch {
    fullPath = undefined;
  }
  if (!fullPath) return UNMATCHED_ROUTE;
  // TanStack gives index routes a trailing slash (`/applications/`); the
  // pathname the browser reports does not have one.
  return fullPath.length > 1 && fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath;
}

/**
 * Templates a same-origin URL's path and drops its query and fragment. A
 * URL on any other origin — an external referrer — is returned unchanged:
 * its path is not one of our routes, and the scrubber already strips its
 * query string.
 */
function templateUrl(value: string): string {
  if (typeof window === 'undefined') return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.origin !== window.location.origin) return value;
  return `${url.origin}${templatePath(url.pathname)}`;
}

function templateProperty(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (PAGE_URL_KEYS.has(key)) return templateUrl(value);
    if (PATHNAME_KEY_PATTERN.test(key)) return templatePath(value);
    return value;
  }
  if (WEB_VITALS_METRIC_KEY_PATTERN.test(key) && value !== null && typeof value === 'object') {
    return templateProperties(value as Record<string, unknown>);
  }
  return value;
}

function templateProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, templateProperty(key, value)]),
  );
}

/** The shape of a PostHog capture as `before_send` sees it — only the part this module touches. */
interface TemplatableEvent {
  properties?: Record<string, unknown>;
}

/**
 * The route-templating half of the `before_send` hook; analytics.ts runs
 * the scrubber after it. Returns a new event and passes `null` through.
 */
export function templateEventUrls<T extends TemplatableEvent | null>(event: T): T {
  if (!event?.properties) return event;
  return { ...event, properties: templateProperties(event.properties) };
}

/** Test seam: forgets the registered resolver. */
export function resetRouteResolverForTests(): void {
  resolveRoute = null;
}
