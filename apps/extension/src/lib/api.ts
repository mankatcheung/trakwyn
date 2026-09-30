import { getAuth, setAuth, clearAuth, getApiUrl } from './storage';
import { createPkcePair } from './pkce';
import {
  OAuthCancelledError,
  buildOAuthStartUrl,
  isUserCancellation,
  oauthErrorMessage,
  parseOAuthRedirect,
} from './oauth';
import {
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

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
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
    await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGES.REFRESH_TOKEN });
    auth = await getAuth();
  }
  if (!auth) throw new Error('Not authenticated');
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

/**
 * Google/GitHub sign-in (JEF-383). Runs in the background service worker: the
 * popup closes when Chrome's sign-in window takes focus.
 *
 * The API finishes the provider round-trip and redirects to this extension's
 * `chromiumapp.org` URL with a short-lived handoff code, which only this
 * login's PKCE verifier can redeem.
 */
export async function loginWithOAuth(provider: OAuthProvider): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  const startUrl = buildOAuthStartUrl(await getApiUrl(), provider, challenge, chrome.runtime.id);

  let redirectUrl: string | undefined;
  try {
    redirectUrl = await chrome.identity.launchWebAuthFlow({ url: startUrl, interactive: true });
  } catch (err) {
    if (isUserCancellation(err)) throw new OAuthCancelledError();
    throw new Error("Couldn't open the sign-in window. Check the API URL and try again.");
  }
  if (!redirectUrl) throw new OAuthCancelledError();

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
