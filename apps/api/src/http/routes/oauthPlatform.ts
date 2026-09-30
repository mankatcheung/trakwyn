import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import { EXTENSION_OAUTH } from '#src/infrastructure/config/constants.js';
import { MOBILE_OAUTH_CALLBACK, OAUTH_PLATFORM, ROUTES } from '#src/http/constants.js';

/** Which client started an OAuth login, and so where it is handed back. */
export type OAuthPlatform = (typeof OAUTH_PLATFORM)[keyof typeof OAUTH_PLATFORM];

export function parsePlatform(value: unknown): OAuthPlatform {
  if (value === OAUTH_PLATFORM.MOBILE) return OAUTH_PLATFORM.MOBILE;
  if (value === OAUTH_PLATFORM.EXTENSION) return OAUTH_PLATFORM.EXTENSION;
  if (value === OAUTH_PLATFORM.EXTENSION_TAB) return OAUTH_PLATFORM.EXTENSION_TAB;
  return OAUTH_PLATFORM.WEB;
}

/** This API's own origin, as the request reached it. */
export function requestOrigin(request: IHttpRequest): string {
  return `${request.protocol}://${request.headers.host}`;
}

/**
 * Where a non-web login is handed its tokens. `undefined` means web, which
 * gets cookies instead.
 * - mobile: the app's deep link
 * - extension: its `chromiumapp.org` URL (JEF-383)
 * - extension in a tab: this API's own done page (Safari, JEF-386). The
 *   extension watches its sign-in tab for that URL, and the code is bound to
 *   the PKCE challenge it sent to /start.
 *
 * The extension ID is checked against the allowlist again here, not only at
 * /start, so the redirect host never rests on the cookie alone.
 */
export function handoffRedirectBase(
  platform: OAuthPlatform,
  extensionId: string,
  allowedExtensionIds: ReadonlySet<string>,
  apiOrigin: string,
): string | undefined {
  if (platform === OAUTH_PLATFORM.MOBILE) return MOBILE_OAUTH_CALLBACK;
  if (platform === OAUTH_PLATFORM.EXTENSION && allowedExtensionIds.has(extensionId)) {
    return EXTENSION_OAUTH.redirectUrl(extensionId);
  }
  if (platform === OAUTH_PLATFORM.EXTENSION_TAB)
    return `${apiOrigin}${ROUTES.EXTENSION_OAUTH_DONE}`;
  return undefined;
}
