import { browser } from 'wxt/browser';
import { getAuth, setAuth, clearAuth, getApiUrl } from './storage';
import { createPkcePair } from './pkce';
import {
  OAuthCancelledError,
  buildOAuthStartUrl,
  buildTabOAuthStartUrl,
  isUserCancellation,
  oauthErrorMessage,
  parseOAuthRedirect,
  tabOAuthDoneUrl,
} from './oauth';
import { runTabOAuth } from './tabOAuth';
import {
  API_ERROR_CODES,
  AUTH_HEADER,
  OAUTH,
  REFRESH_LEEWAY_MS,
  RUNTIME_MESSAGES,
  type OAuthProvider,
} from '../constants';

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  jobUrl?: string;
  description?: string;
  source?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** A GraphQL error, carrying the API's `extensions.code` when it sent one. */
export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === API_ERROR_CODES.UNAUTHORIZED;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const apiUrl = await getApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `${AUTH_HEADER.BEARER_PREFIX}${token}`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };
  if (json.errors?.length) {
    const [first] = json.errors;
    throw new ApiError(first.message, first.extensions?.code);
  }
  if (!json.data) throw new Error('No data returned');
  return json.data;
}

/**
 * Refresh runs in the background service worker only (see RUNTIME_MESSAGES),
 * so the popup asks it rather than rotating the refresh token itself.
 */
async function authedGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let auth = await getAuth();
  if (auth && Date.now() > auth.expiresAt - REFRESH_LEEWAY_MS) {
    await browser.runtime.sendMessage({ type: RUNTIME_MESSAGES.REFRESH_TOKEN });
    auth = await getAuth();
  }
  if (!auth) throw new ApiError('Not authenticated', API_ERROR_CODES.UNAUTHORIZED);
  return gql<T>(query, variables, auth.token);
}

// The *Mobile mutations return both tokens in the body: the extension has no
// cookie jar tied to the API, same as the mobile app.
const LOGIN = `
  mutation LoginMobile($email: String!, $password: String!) {
    loginMobile(email: $email, password: $password) {
      totpRequired
      accessToken
      refreshToken
    }
  }
`;
const ME = `query Me { me { id email name avatarUrl } }`;
const REFRESH = `
  mutation RefreshTokenMobile($refreshToken: String!) {
    refreshTokenMobile(refreshToken: $refreshToken) { accessToken refreshToken }
  }
`;
const EXCHANGE_OAUTH_CODE = `
  mutation ExchangeMobileOAuthCode($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) { accessToken refreshToken }
  }
`;
const CREATE_APPLICATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id company role status }
  }
`;

/** The access token's `exp`, in epoch ms (the payload is base64url JSON). */
export function tokenExpiry(accessToken: string): number {
  const [, payload] = accessToken.split('.');
  const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    exp: number;
  };
  return exp * 1000;
}

async function storeTokens(tokens: TokenPair): Promise<void> {
  await setAuth({
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokenExpiry(tokens.accessToken),
  });
}

export async function login(email: string, password: string): Promise<void> {
  const data = await gql<{
    loginMobile: {
      totpRequired: boolean;
      accessToken: string | null;
      refreshToken: string | null;
    };
  }>(LOGIN, { email, password });

  if (data.loginMobile.totpRequired) {
    throw new Error(
      "This account has two-factor authentication enabled, which the extension doesn't support yet — log in on the web app instead.",
    );
  }
  const { accessToken, refreshToken } = data.loginMobile;
  if (!accessToken || !refreshToken) throw new Error('Login failed');
  await storeTokens({ accessToken, refreshToken });
}

/** Chrome has it; Safari has no `identity` API and signs in in a tab. */
function supportsWebAuthFlow(): boolean {
  return typeof browser.identity?.launchWebAuthFlow === 'function';
}

async function runWebAuthFlow(startUrl: string): Promise<string> {
  let redirectUrl: string | undefined;
  try {
    redirectUrl = await browser.identity.launchWebAuthFlow({ url: startUrl, interactive: true });
  } catch (err) {
    if (isUserCancellation(err)) throw new OAuthCancelledError();
    throw new Error("Couldn't open the sign-in window. Check the API URL and try again.");
  }
  if (!redirectUrl) throw new OAuthCancelledError();
  return redirectUrl;
}

/**
 * Google/GitHub sign-in. Runs in the background worker: the popup closes when
 * the sign-in window or tab takes focus.
 *
 * The API finishes the provider round-trip and hands back a short-lived
 * handoff code, which only this login's PKCE verifier can redeem:
 * - Chrome (JEF-383): to this extension's `chromiumapp.org` URL, through
 *   `launchWebAuthFlow`.
 * - Safari (JEF-386): to a fixed page on the API's origin, in a tab (see
 *   tabOAuth.ts).
 */
export async function loginWithOAuth(provider: OAuthProvider): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  const apiUrl = await getApiUrl();
  const redirectUrl = supportsWebAuthFlow()
    ? await runWebAuthFlow(buildOAuthStartUrl(apiUrl, provider, challenge, browser.runtime.id))
    : await runTabOAuth(
        buildTabOAuthStartUrl(apiUrl, provider, challenge),
        tabOAuthDoneUrl(apiUrl),
        verifier,
      );
  await redeemOAuthRedirect(redirectUrl, verifier);
}

/**
 * Turns the API's redirect into a stored session: an error slug becomes a
 * thrown error, and a handoff code is redeemed with `verifier`.
 */
export async function redeemOAuthRedirect(redirectUrl: string, verifier: string): Promise<void> {
  const result = parseOAuthRedirect(redirectUrl);
  if ('error' in result) {
    if (result.error === OAUTH.CANCELLED_SLUG) throw new OAuthCancelledError();
    throw new Error(oauthErrorMessage(result.error));
  }

  const data = await gql<{ exchangeMobileOAuthCode: TokenPair }>(EXCHANGE_OAUTH_CODE, {
    code: result.code,
    codeVerifier: verifier,
  });
  await storeTokens(data.exchangeMobileOAuthCode);
}

export async function logout(): Promise<void> {
  await clearAuth();
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const data = await authedGql<{ me: CurrentUser | null }>(ME);
  if (!data.me) throw new ApiError('Not authenticated', API_ERROR_CODES.UNAUTHORIZED);
  return data.me;
}

let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth) return false;
  try {
    const data = await gql<{ refreshTokenMobile: TokenPair }>(REFRESH, {
      refreshToken: auth.refreshToken,
    });
    await storeTokens(data.refreshTokenMobile);
    return true;
  } catch {
    await clearAuth();
    return false;
  }
}

/**
 * Renews the session with the stored refresh token. Single-flighted: the API
 * rotates refresh tokens, so two overlapping refreshes would present the same
 * token twice.
 */
export function refreshToken(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function createApplication(input: {
  company: string;
  role: string;
  jobUrl?: string;
  description?: string;
  source?: string;
}): Promise<JobApplication> {
  const data = await authedGql<{ createApplication: JobApplication }>(CREATE_APPLICATION, {
    input,
  });
  return data.createApplication;
}
