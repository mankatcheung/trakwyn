import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { gqlRequest } from '../graphql/client';
import { API_ORIGIN, OAUTH_MOBILE_CALLBACK_URL } from '../constants';
import { oauthErrorMessage } from '../screens/auth/oauthErrorMessage';
import { createPkcePair } from './pkce';
import type { TokenPair } from './tokenStorage';

/**
 * Step-up for an account with no password (JEF-463): sign in again with
 * Google, or a code mailed to the account. Each ends with the same session's
 * tokens re-signed with a fresh authTime, which the caller stores. The
 * password step-up is `reauthenticateMobile`, in AuthContext.
 */

/** How the API says this user can step up, in the order to offer them. */
export type StepUpMethod = 'password' | 'google' | 'github' | 'email_code';

/** A provider that can prove a fresh sign-in; only Google today. */
export type ReauthProvider = 'google';

export const STEP_UP_METHODS_QUERY = `query StepUpMethods { me { stepUpMethods } }`;

export const START_OAUTH_REAUTH_MUTATION = `
  mutation StartOAuthReauth($provider: OAuthProvider!) {
    startOAuthReauth(provider: $provider)
  }
`;

export const REQUEST_STEP_UP_CODE_MUTATION = `mutation RequestStepUpCode { requestStepUpCode }`;

export const VERIFY_STEP_UP_CODE_MOBILE_MUTATION = `
  mutation VerifyStepUpCodeMobile($code: String!) {
    verifyStepUpCodeMobile(code: $code) {
      accessToken
      refreshToken
    }
  }
`;

const EXCHANGE_REAUTH_CODE_MUTATION = `
  mutation ExchangeReauthCode($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
      accessToken
      refreshToken
    }
  }
`;

/**
 * Which methods to offer. A failed read falls back to the password prompt,
 * which is what every account was offered before; the API still refuses
 * whatever does not fit the account.
 */
export async function fetchStepUpMethods(): Promise<StepUpMethod[]> {
  try {
    const data = await gqlRequest<{ me: { stepUpMethods: StepUpMethod[] } | null }>(
      STEP_UP_METHODS_QUERY,
    );
    const methods = data?.me?.stepUpMethods;
    return methods && methods.length > 0 ? methods : ['password'];
  } catch {
    return ['password'];
  }
}

export async function requestStepUpCode(): Promise<void> {
  await gqlRequest(REQUEST_STEP_UP_CODE_MUTATION);
}

export async function verifyStepUpCode(code: string): Promise<TokenPair> {
  const data = await gqlRequest<{ verifyStepUpCodeMobile: TokenPair }>(
    VERIFY_STEP_UP_CODE_MOBILE_MUTATION,
    { code: code.trim() },
    // A wrong code is UNAUTHORIZED too — it must not read as an expired token.
    { refreshOnUnauthorized: false },
  );
  return data.verifyStepUpCodeMobile;
}

/**
 * The same browser round trip as signing in with Google (JEF-275), started
 * with a ticket instead of nothing: the in-app browser carries none of the
 * app's credentials, so the ticket is what names this user and session.
 * Resolves null when the user backs out of the browser.
 */
export async function reauthenticateWithProvider(
  provider: ReauthProvider,
  signInFailedMessage: string,
): Promise<TokenPair | null> {
  const { startOAuthReauth: ticket } = await gqlRequest<{ startOAuthReauth: string }>(
    START_OAUTH_REAUTH_MUTATION,
    { provider },
  );
  const { verifier, challenge } = await createPkcePair();
  const query = new URLSearchParams({
    mode: 'reauth',
    platform: 'mobile',
    ticket,
    codeChallenge: challenge,
  });
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_ORIGIN}/auth/oauth/${provider}/start?${query.toString()}`,
    OAUTH_MOBILE_CALLBACK_URL,
  );
  if (result.type !== 'success') return null;

  const { queryParams } = Linking.parse(result.url);
  const oauthError = queryParams?.oauthError;
  if (typeof oauthError === 'string') throw new Error(oauthErrorMessage(oauthError));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error(signInFailedMessage);

  try {
    const data = await gqlRequest<{ exchangeMobileOAuthCode: TokenPair }>(
      EXCHANGE_REAUTH_CODE_MUTATION,
      { code, codeVerifier: verifier },
    );
    return data.exchangeMobileOAuthCode;
  } catch {
    throw new Error(signInFailedMessage);
  }
}
