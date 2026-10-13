import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';

export interface UploadUrlPayloadDTO {
  uploadUrl: string;
  storageKey: string;
  access: 'public' | 'private';
}

import { builder } from '#src/http/schema/builder.js';
import { ENV, NODE_ENV } from '#src/infrastructure/config/constants.js';
import { COOKIES, COOKIE_MAX_AGE_S, COOKIE_PATH, COOKIE_SAME_SITE } from '#src/http/constants.js';

export const UploadUrlPayloadRef = builder.objectRef<UploadUrlPayloadDTO>('UploadUrlPayload');
UploadUrlPayloadRef.implement({
  fields: (t) => ({
    uploadUrl: t.exposeString('uploadUrl'),
    storageKey: t.exposeString('storageKey'),
    /** `public` or `private`: the access the client's Blob `put()` must use with this token (JEF-51). */
    access: t.exposeString('access'),
  }),
});

const isProduction = process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;

// Web and API are deployed on separate subdomains (e.g. www.trakwyn.com /
// api.trakwyn.com) — without an explicit Domain, cookies default to
// host-only on api.trakwyn.com, invisible to document.cookie on
// www.trakwyn.com. COOKIE_DOMAIN (e.g. ".trakwyn.com") shares them across
// both. Leave unset in dev (host-only on localhost is fine there).
const cookieDomain = process.env[ENV.COOKIE_DOMAIN];

// The web app and API are deployed on separate domains, so the refresh
// cookie must be sent cross-site on the fetch to POST /graphql that retries
// it — that requires SameSite=None, which browsers only honor alongside
// Secure. Dev stays Lax since there's no HTTPS to satisfy that requirement.
const COOKIE_BASE = {
  sameSite: isProduction ? 'none' : COOKIE_SAME_SITE,
  path: COOKIE_PATH,
  secure: isProduction,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
} as const;

const COOKIE_NAMES = [COOKIES.ACCESS_TOKEN, COOKIES.REFRESH_TOKEN, COOKIES.LOGGED_IN];

// A browser that authenticated before COOKIE_DOMAIN was set (or before it
// existed at all) may still be holding host-only cookies from that time —
// a later Domain-scoped Set-Cookie does NOT overwrite those, since
// (name, domain, path) is the cookie's identity to the browser, not just
// name. Left alone, both coexist indefinitely and get sent together on
// every request to the API, and the server has no reliable way to tell
// which one it received. Issue a clearing Set-Cookie for the host-only
// variant alongside every domain-scoped set/clear so any pre-migration
// leftover self-heals on the next auth operation instead of requiring a
// manual browser cookie clear.
function clearLegacyHostOnlyCookies(reply: IHttpResponse): void {
  for (const name of COOKIE_NAMES) reply.clearCookie(name, { path: COOKIE_PATH });
}

export function setAuthCookies(
  reply: IHttpResponse,
  accessToken: string,
  refreshToken: string,
): void {
  reply.setCookie(COOKIES.ACCESS_TOKEN, accessToken, {
    ...COOKIE_BASE,
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_S.ACCESS_TOKEN,
  });
  reply.setCookie(COOKIES.REFRESH_TOKEN, refreshToken, {
    ...COOKIE_BASE,
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_S.REFRESH_TOKEN,
  });
  reply.setCookie(COOKIES.LOGGED_IN, '1', {
    ...COOKIE_BASE,
    httpOnly: false,
    maxAge: COOKIE_MAX_AGE_S.REFRESH_TOKEN,
  });
  if (cookieDomain) clearLegacyHostOnlyCookies(reply);
}

export function clearAuthCookies(reply: IHttpResponse): void {
  // Must match the Domain the cookie was set with, or the browser treats
  // this as clearing a different (non-existent) cookie and leaves the
  // original in place.
  const clearOptions = { path: COOKIE_PATH, ...(cookieDomain ? { domain: cookieDomain } : {}) };
  reply.clearCookie(COOKIES.ACCESS_TOKEN, clearOptions);
  reply.clearCookie(COOKIES.REFRESH_TOKEN, clearOptions);
  reply.clearCookie(COOKIES.LOGGED_IN, clearOptions);
  if (cookieDomain) clearLegacyHostOnlyCookies(reply);
}
