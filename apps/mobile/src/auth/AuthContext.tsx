import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { getTokens, setTokens, clearTokens, type TokenPair } from './tokenStorage';
import {
  gqlRequest,
  getValidAccessToken,
  setAccessToken,
  onSessionExpired,
} from '../graphql/client';
import { API_ORIGIN, OAUTH_MOBILE_CALLBACK_URL, RESTORE_REFRESH_WAIT_MS } from '../constants';
import { oauthErrorMessage } from '../screens/auth/oauthErrorMessage';
import { createPkcePair } from './pkce';

export type OAuthProviderName = 'google' | 'github';

const REGISTER_MOBILE_MUTATION = `
  mutation RegisterMobile($email: String!, $password: String!) {
    registerMobile(email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`;

const LOGIN_MOBILE_MUTATION = `
  mutation LoginMobile($email: String!, $password: String!) {
    loginMobile(email: $email, password: $password) {
      success
      totpRequired
      accessToken
      refreshToken
    }
  }
`;

const LOGIN_WITH_TOTP_MOBILE_MUTATION = `
  mutation LoginWithTotpMobile($email: String!, $password: String!, $code: String!) {
    loginWithTotpMobile(email: $email, password: $password, code: $code) {
      accessToken
      refreshToken
    }
  }
`;

const REAUTHENTICATE_MOBILE_MUTATION = `
  mutation ReauthenticateMobile($password: String!, $code: String) {
    reauthenticateMobile(password: $password, code: $code) {
      success
      totpRequired
      accessToken
      refreshToken
    }
  }
`;

const EXCHANGE_MOBILE_OAUTH_CODE_MUTATION = `
  mutation ExchangeMobileOAuthCode($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
      accessToken
      refreshToken
    }
  }
`;

const LOGOUT_MUTATION = `mutation Logout { logout }`;

interface LoginMobileResult {
  success: boolean;
  totpRequired: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface LoginOutcome {
  totpRequired: boolean;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True once the session has died underneath the user (a rejected refresh),
   * as opposed to a deliberate sign-out — the navigator uses it to put them
   * back where they were after they sign in again.
   */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  loginWithTotp: (email: string, password: string, code: string) => Promise<void>;
  /**
   * Opens the system browser on the API's OAuth start route and waits for it
   * to hand control back via the app's own URL scheme (JEF-275). Resolves
   * quietly if the user backs out of the browser — that's not a failure —
   * and throws a user-facing message for anything that is one.
   */
  loginWithOAuth: (provider: OAuthProviderName) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Step-up re-authentication for the current session (JEF-44): the password,
   * plus a TOTP code once `totpRequired` has come back. The API re-signs the
   * existing session's tokens with a fresh authTime — same user, same session,
   * so unlike login this keeps the cache.
   */
  reauthenticate: (password: string, code?: string) => Promise<LoginOutcome>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Resolves to undefined once `ms` have passed, if `promise` hasn't settled by then. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // AuthProvider is mounted inside QueryClientProvider (app/_layout.tsx), so
  // the cache is reachable from every session boundary below.
  const { t } = useTranslation('auth');
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    return onSessionExpired(() => {
      // Mirrors apps/web (graphql/client.ts): nothing the dead session loaded
      // should survive into whichever account signs in next.
      queryClient.clear();
      setSessionExpired(true);
      setIsAuthenticated(false);
    });
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let tokens: TokenPair | null = null;
      try {
        tokens = await getTokens();
      } catch {
        // expo-secure-store can throw on read — on Android, any keystore
        // failure it does not recognise surfaces as a DecryptException. An
        // unreadable pair is no session: clear it and start clean, rather
        // than leave isLoading true and the app on its launch spinner forever.
        await clearTokens().catch(() => {});
      }
      if (cancelled) return;
      if (tokens) {
        setAccessToken(tokens.accessToken);
        // The restored access token has almost always outlived its 15 minutes.
        // Refreshing it now, within a bounded wait, spares every first-screen
        // query a failed round-trip; if the refresh is slow the app opens
        // anyway and those queries join the same in-flight refresh. Only a
        // rejected refresh (null) means there is no session; a timeout
        // (undefined) just means "still waiting".
        const valid = await withTimeout(getValidAccessToken(), RESTORE_REFRESH_WAIT_MS);
        if (cancelled) return;
        setIsAuthenticated(valid !== null);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyTokens = useCallback(
    async (tokens: TokenPair) => {
      await setTokens(tokens);
      setAccessToken(tokens.accessToken);
      // Nothing cached before this point belongs to the account signing in —
      // apps/web does the same with resetQueries() on its login page.
      queryClient.clear();
      setSessionExpired(false);
      setIsAuthenticated(true);
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const data = await gqlRequest<{ loginMobile: LoginMobileResult }>(LOGIN_MOBILE_MUTATION, {
        email,
        password,
      });
      const result = data.loginMobile;
      if (result.totpRequired || !result.accessToken || !result.refreshToken) {
        return { totpRequired: result.totpRequired };
      }
      await applyTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return { totpRequired: false };
    },
    [applyTokens],
  );

  const loginWithTotp = useCallback(
    async (email: string, password: string, code: string): Promise<void> => {
      const data = await gqlRequest<{ loginWithTotpMobile: TokenPair }>(
        LOGIN_WITH_TOTP_MOBILE_MUTATION,
        { email, password, code },
      );
      await applyTokens(data.loginWithTotpMobile);
    },
    [applyTokens],
  );

  const loginWithOAuth = useCallback(
    async (provider: OAuthProviderName): Promise<void> => {
      // Generated before the browser ever opens: `challenge` rides the
      // `/start` redirect, `verifier` stays in this call's closure until the
      // exchange below presents it. Binds redemption of the handoff code to
      // this call, not just to whoever's holding the custom-scheme redirect
      // (JEF-275) — see MobileOAuthHandoffService on the API side.
      const { verifier, challenge } = await createPkcePair();
      const startUrl = `${API_ORIGIN}/auth/oauth/${provider}/start?platform=mobile&codeChallenge=${encodeURIComponent(challenge)}`;
      const result = await WebBrowser.openAuthSessionAsync(startUrl, OAUTH_MOBILE_CALLBACK_URL);

      // The user backed out of the browser (system back gesture, swipe-down,
      // or the provider's own cancel button before it ever redirects back) —
      // not a failure, nothing to report.
      if (result.type !== 'success') return;

      const { queryParams } = Linking.parse(result.url);
      const oauthError = queryParams?.oauthError;
      if (typeof oauthError === 'string') {
        throw new Error(oauthErrorMessage(oauthError));
      }
      const code = queryParams?.code;
      if (typeof code !== 'string') {
        throw new Error(t('errors.signInFailed'));
      }

      let data: { exchangeMobileOAuthCode: { accessToken: string; refreshToken: string } };
      try {
        data = await gqlRequest(EXCHANGE_MOBILE_OAUTH_CODE_MUTATION, {
          code,
          codeVerifier: verifier,
        });
      } catch {
        // The handoff code has already been redeemed once, expired, was
        // presented with the wrong verifier, or the request never landed —
        // none of that is worth distinguishing for the user, unlike the
        // oauthError slugs above which are.
        throw new Error(t('errors.signInFailed'));
      }
      await applyTokens(data.exchangeMobileOAuthCode);
    },
    [applyTokens, t],
  );

  const register = useCallback(
    async (email: string, password: string): Promise<void> => {
      const data = await gqlRequest<{ registerMobile: TokenPair }>(REGISTER_MOBILE_MUTATION, {
        email,
        password,
      });
      await applyTokens(data.registerMobile);
    },
    [applyTokens],
  );

  const reauthenticate = useCallback(
    async (password: string, code?: string): Promise<LoginOutcome> => {
      const data = await gqlRequest<{ reauthenticateMobile: LoginMobileResult }>(
        REAUTHENTICATE_MOBILE_MUTATION,
        { password, code: code ?? null },
        // A wrong password here is UNAUTHORIZED too — it must not read as an
        // expired token and be replayed.
        { refreshOnUnauthorized: false },
      );
      const result = data.reauthenticateMobile;
      if (result.totpRequired || !result.accessToken || !result.refreshToken) {
        return { totpRequired: result.totpRequired };
      }
      await setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      setAccessToken(result.accessToken);
      return { totpRequired: false };
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    await gqlRequest(LOGOUT_MUTATION).catch(() => {
      // Best-effort — an already-expired/missing session shouldn't block logout.
    });
    await clearTokens();
    setAccessToken(null);
    // Mirrors apps/web (AuthenticatedLayout.tsx): the tokens are gone, but
    // every application, note, document and message this account loaded is
    // still in the cache until this runs — and the next account to sign in
    // on this device would see it.
    queryClient.clear();
    setSessionExpired(false);
    setIsAuthenticated(false);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated,
      sessionExpired,
      login,
      loginWithTotp,
      loginWithOAuth,
      register,
      logout,
      reauthenticate,
    }),
    [
      isLoading,
      isAuthenticated,
      sessionExpired,
      login,
      loginWithTotp,
      loginWithOAuth,
      register,
      logout,
      reauthenticate,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
