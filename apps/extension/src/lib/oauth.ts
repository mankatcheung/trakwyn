import { OAUTH, type OAuthProvider } from '../constants';

/** The OAuth redirect the API handed back: a handoff code, or an error slug. */
export type OAuthRedirectResult = { code: string } | { error: string };

/** The user backed out (closed the window or pressed Cancel). Not a fault. */
export class OAuthCancelledError extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'OAuthCancelledError';
  }
}

/** The API ended the sign-in with an error slug (a closed set, never free text). */
export class OAuthFailedError extends Error {
  constructor(readonly slug: string) {
    super(oauthErrorMessage(slug));
    this.name = 'OAuthFailedError';
  }
}

function oauthStartUrl(
  apiUrl: string,
  provider: OAuthProvider,
  platform: string,
  codeChallenge: string,
): URL {
  const url = new URL(OAUTH.startPath(provider), new URL(apiUrl).origin);
  url.searchParams.set('platform', platform);
  url.searchParams.set('codeChallenge', codeChallenge);
  return url;
}

/**
 * The API's `/start` URL for a `launchWebAuthFlow` login (Chrome, JEF-383).
 * The API origin is taken from the configured GraphQL endpoint, so a
 * self-hosted API URL works the same way as the default.
 */
export function buildOAuthStartUrl(
  apiUrl: string,
  provider: OAuthProvider,
  codeChallenge: string,
  extensionId: string,
): string {
  const url = oauthStartUrl(apiUrl, provider, OAUTH.PLATFORM, codeChallenge);
  url.searchParams.set('extensionId', extensionId);
  return url.toString();
}

/**
 * The API's `/start` URL for a login run in a tab (Safari, JEF-386). No
 * extension ID: the API ends it on its own `tabOAuthDoneUrl`, not on a URL
 * that names the extension.
 */
export function buildTabOAuthStartUrl(
  apiUrl: string,
  provider: OAuthProvider,
  codeChallenge: string,
): string {
  return oauthStartUrl(apiUrl, provider, OAUTH.TAB_PLATFORM, codeChallenge).toString();
}

/** Where the API ends a tab login: a fixed page on the API's own origin. */
export function tabOAuthDoneUrl(apiUrl: string): string {
  return new URL(OAUTH.TAB_DONE_PATH, new URL(apiUrl).origin).toString();
}

export function parseOAuthRedirect(redirectUrl: string): OAuthRedirectResult {
  const params = new URL(redirectUrl).searchParams;
  const code = params.get('code');
  if (code) return { code };
  return { error: params.get('oauthError') ?? OAUTH.FAILED_SLUG };
}

/**
 * Turns the API's `oauthError` slug into copy, mirroring apps/mobile's
 * oauthErrorMessage.ts. The API sends a value from a closed set, never free
 * text, so an unrecognised slug falls back to the generic line.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'That sign-in link has expired or was not started here. Please try again.',
  provider_mismatch: 'That sign-in link has expired or was not started here. Please try again.',
  email_in_use:
    'An account with this email already exists. Sign in with your password, then link this provider from Settings on the web app.',
  email_not_verified:
    'Your provider did not share a verified email address, so an account could not be created.',
  account_not_found: 'That linked account no longer exists.',
};
const GENERIC_ERROR = "Sign-in didn't work. Please try again.";

export function oauthErrorMessage(slug: string): string {
  return ERROR_MESSAGES[slug] ?? GENERIC_ERROR;
}

/**
 * `launchWebAuthFlow` rejects with this when the user closes the window —
 * Chrome's only signal for it, so it is matched on the message.
 */
export function isUserCancellation(err: unknown): boolean {
  return err instanceof Error && /did not approve/i.test(err.message);
}
