import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import { ENV, NODE_ENV, OAUTH } from '#src/infrastructure/config/constants.js';
import { COOKIES, COOKIE_PATH } from '#src/http/constants.js';
import { type OAuthPlatform, parsePlatform } from '#src/http/routes/oauthPlatform.js';

/**
 * Options for the cookie that ties a redirect to the browser that began it.
 *
 * `SameSite=Lax`, deliberately not the `none` the auth cookies use: the
 * callback arrives as a top-level GET navigation, which Lax permits, and
 * anything looser would weaken the very thing this cookie exists to prove.
 * Host-only (no `domain`) because only this API ever reads it, and scoped to
 * the same window as the state it guards.
 */
export const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION,
  sameSite: 'lax',
  path: COOKIE_PATH,
  maxAge: Math.floor(OAUTH.STATE_TTL_MS / 1000),
} as const;

/**
 * The redirect cookie carries five things the callback needs and the
 * browser must not be able to tamper with: the state's nonce (JEF-198), the
 * provider-facing PKCE verifier (JEF-200), which client started the flow
 * (JEF-275, read even by branches that never verify `state`), the client's
 * own PKCE code_challenge for the handoff code (mobile, JEF-275, and
 * extension, JEF-383), and, extension only, which extension to hand back to.
 * The last two are empty for web, which has no handoff code to bind.
 *
 * One cookie rather than several: created, read and cleared together, so it
 * cannot arrive with some parts but not others. Every part is base64url,
 * hex, empty, a fixed OAUTH_PLATFORM value or an `[a-p]` extension ID, so
 * none can contain the separator.
 */
const COOKIE_SEPARATOR = '.';

export function encodeRedirectCookie(
  nonce: string,
  codeVerifier: string,
  platform: OAuthPlatform,
  handoffCodeChallenge: string,
  extensionId: string,
): string {
  return [nonce, codeVerifier, platform, handoffCodeChallenge, extensionId].join(COOKIE_SEPARATOR);
}

export function decodeRedirectCookie(request: IHttpRequest): {
  nonce: string;
  codeVerifier: string;
  platform: OAuthPlatform;
  handoffCodeChallenge: string;
  extensionId: string;
} | null {
  const raw = request.cookies[COOKIES.OAUTH_STATE];
  if (typeof raw !== 'string') return null;
  const [nonce, codeVerifier, platform, handoffCodeChallenge, extensionId] =
    raw.split(COOKIE_SEPARATOR);
  if (!nonce || !codeVerifier) return null;
  return {
    nonce,
    codeVerifier,
    platform: parsePlatform(platform),
    handoffCodeChallenge: handoffCodeChallenge ?? '',
    extensionId: extensionId ?? '',
  };
}

/**
 * The signature proves we minted a state; it does not prove we minted it for
 * the browser presenting it. Without this check an attacker can run the flow
 * themselves, keep their own valid code and state, and hand the victim the
 * callback URL — logging the victim into the attacker's account (JEF-198).
 *
 * A missing or half-formed cookie is a hard failure, never a fall-through:
 * treating it as "no cookie, carry on" would leave the hole open while looking
 * closed, and would silently drop PKCE with it.
 */
export function stateMatchesBrowser(nonce: string, cookieNonce: string): boolean {
  return cookieNonce.length > 0 && cookieNonce === nonce;
}
