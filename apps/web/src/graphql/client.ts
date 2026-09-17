import { GraphQLClient } from 'graphql-request';
import { queryClient } from '#/lib/queryClient';
import { DEFAULT_API_URL, ERROR_CODES } from '#/constants';

const API_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

// graphql-request always does `new URL(endpoint)` internally, which throws
// for a relative string like the dev default '/graphql' — unlike the plain
// `fetch()` below, which resolves relative URLs against the document itself.
// Resolving is best-effort: a couple of routes that aren't `ssr: false`
// (e.g. confirm-email-change) import this module for its client-only
// effect-triggered calls, so this file's top level still runs during SSR,
// where there's no `window` to resolve against — and a already-absolute
// `API_URL` (e.g. production) needs no resolving in the first place.
function resolveClientUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

const GQL_CLIENT_URL = resolveClientUrl(API_URL);

/**
 * Sibling of the GraphQL endpoint for the chat streaming SSE route
 * (JEF-239, `ROUTES.CHAT_STREAM` on the API) — not itself a GraphQL
 * endpoint, so it's derived by swapping `/graphql`'s path rather than
 * reusing `GQL_CLIENT_URL` outright.
 */
export const CHAT_STREAM_URL = resolveClientUrl(API_URL.replace(/\/graphql$/, '/chat/stream'));

const REFRESH_MUTATION = `mutation { refreshToken }`;

// Non-HttpOnly hint cookie the API sets alongside the real HttpOnly
// trakwyn_access_token/trakwyn_refresh_token cookies (apps/api's setAuthCookies()) —
// must match COOKIES.LOGGED_IN there. The web app can never read the real
// tokens (by design), so this is how it knows a session likely exists
// without a network round-trip.
const LOGGED_IN_COOKIE = 'trakwyn_logged_in';

/**
 * Synchronous, no network call: used by route beforeLoad guards to decide
 * whether to redirect to /login before rendering. This only needs to be
 * directionally correct, not authoritative — the real access token cookie
 * is attached automatically by the browser on every request (see
 * `credentials: 'include'` below), and any request that finds it
 * missing/expired gets silently refreshed and retried by
 * responseMiddleware regardless of what this returned.
 */
export function hasSessionCookie(): boolean {
  return document.cookie.split('; ').some((entry) => entry.startsWith(`${LOGGED_IN_COOKIE}=`));
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const raw = await fetch(API_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: REFRESH_MUTATION }),
    });
    const json = (await raw.json()) as {
      data?: { refreshToken?: string | null };
      errors?: unknown[];
    };
    return (json.data?.refreshToken ?? null) !== null;
  } catch {
    return false;
  }
}

function getOrStartRefresh(): Promise<boolean> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = doRefresh().finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });
  }
  return refreshPromise!;
}

export const gqlClient = new GraphQLClient(GQL_CLIENT_URL, {
  credentials: 'include',
  responseMiddleware: async (response) => {
    // graphql-request v7 wraps GraphQL errors in a ClientError (extends Error).
    // The errors live on response.response.errors, not directly on response.
    const payload =
      response instanceof Error
        ? (
            response as unknown as {
              response?: { errors?: Array<{ extensions?: { code?: string } }> };
            }
          ).response
        : (response as { errors?: Array<{ extensions?: { code?: string } }> });

    const hasUnauthorized = payload?.errors?.some(
      (e) => e.extensions?.code === ERROR_CODES.UNAUTHORIZED,
    );

    if (!hasUnauthorized) return;

    const ok = await getOrStartRefresh();
    if (ok) {
      // Fresh access-token cookie is set — re-run all active queries so they pick it up.
      await queryClient.invalidateQueries();
    } else {
      queryClient.clear();
      const { pathname, search, hash } = window.location;

      // Already on an auth page — a late UNAUTHORIZED (a query left over from
      // the session that just ended, say after deleting the account) would
      // otherwise hard-reload the page the user is already on, discarding
      // whatever they have typed into the sign-in form. Worse, assigning
      // `location.href` while the browser is navigating aborts that
      // navigation, which is how this surfaced: an E2E run leaving /login for
      // /dashboard died with ERR_ABORTED.
      if (pathname === '/login' || pathname === '/register') return;

      // The session died mid-app. Carry the current URL to /login so signing
      // in lands the user back where they were (JEF-233); the marketing root
      // isn't a destination worth returning to, and environments without a
      // readable location (tests) just get plain /login.
      const intended =
        typeof pathname === 'string' && pathname !== '/' ? `${pathname}${search}${hash}` : '';
      window.location.href = intended
        ? `/login?returnTo=${encodeURIComponent(intended)}`
        : '/login';
    }
  },
});
