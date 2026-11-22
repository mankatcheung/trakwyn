import { webOrigin } from '../../../devPorts';
import { CookieJar, cookieFetch } from './cookieJar';
import { API_GRAPHQL_URL } from './apiProcess';

/** A page the user is on when the session dies, so `endSession` has a `returnTo` to carry. */
const START_URL = `${webOrigin}/applications?status=open#top`;

export interface BrowserShim {
  jar: CookieJar;
  /** Every URL the code under test assigned to `location.href`, oldest first. */
  navigations: string[];
  /** Empties the jar and the recorded navigations. */
  reset(): void;
}

/**
 * Installs the browser globals apps/web's client reads (`window.location`,
 * `document.cookie`) and a cookie-keeping `fetch`, in a plain Node environment.
 *
 * jsdom was the first choice and is the wrong tool here: its `location` is
 * unforgeable, so a test can neither set where the page is nor see the
 * `location.href = '/login?returnTo=…'` that ends a session, and its
 * `document.cookie` is a second jar that never sees the API's `Set-Cookie`.
 * `document.cookie` here reads the same jar `fetch` writes, minus HttpOnly
 * cookies, which is what a browser exposes.
 */
export function installBrowserShim(): BrowserShim {
  const jar = new CookieJar();
  const navigations: string[] = [];
  const page = new URL(START_URL);

  const location = {
    hostname: page.hostname,
    origin: page.origin,
    pathname: page.pathname,
    search: page.search,
    hash: page.hash,
    get href() {
      return page.href;
    },
    set href(next: string) {
      // Recorded, not followed: there is no page to navigate.
      navigations.push(next);
    },
  };

  // Inert DOM stubs: `sonner`, imported through `lib/queryClient`, injects a
  // <style> element when its module loads.
  const inertNode = { appendChild: () => inertNode, styleSheet: undefined };
  const document = {
    head: inertNode,
    createElement: () => ({ ...inertNode }),
    createTextNode: () => ({}),
    getElementsByTagName: () => [inertNode],
    get cookie() {
      return jar.documentCookie();
    },
    // `clearSessionHint` is the only write the client makes:
    // `name=; Max-Age=0; path=/[; domain=…]`, which `store` reads as a delete.
    set cookie(assignment: string) {
      jar.store(assignment);
    },
  };

  Object.assign(globalThis, { window: { location, document }, document });
  // The project's own API: `integration` and `integration-plans` each point
  // VITE_API_URL at a different process (vitest.config.ts).
  const apiUrl = import.meta.env.VITE_API_URL ?? API_GRAPHQL_URL;
  globalThis.fetch = cookieFetch(jar, new URL(apiUrl).origin, globalThis.fetch);

  return {
    jar,
    navigations,
    reset() {
      jar.clear();
      navigations.length = 0;
    },
  };
}
