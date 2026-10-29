export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /**
   * When the provider last authenticated the user (OIDC `auth_time`), if it
   * says. Only a provider that reports it can serve a step-up (JEF-463); a
   * live session at the provider proves nothing about who is at the keyboard
   * now.
   */
  authTime?: Date | null;
}

export interface AuthorizationUrlOptions {
  /**
   * Ask the provider to authenticate the user again rather than reuse its
   * session (`max_age=0`), for a step-up (JEF-463). Only meaningful when
   * `supportsReauth` is true.
   */
  forceReauth?: boolean;
}

export interface IOAuthProvider {
  /**
   * Whether this provider can prove a fresh sign-in: it honours a request to
   * re-authenticate and reports `authTime`. Google does; GitHub does neither,
   * so an account that signs in with GitHub steps up by emailed code instead.
   */
  readonly supportsReauth: boolean;
  /**
   * Builds the URL the browser is redirected to, to start the provider's
   * consent flow. `codeChallenge` is the SHA-256 of a verifier this server
   * keeps — required rather than optional, so PKCE cannot be dropped by a
   * caller simply not passing it (JEF-200).
   */
  getAuthorizationUrl(
    state: string,
    redirectUri: string,
    codeChallenge: string,
    options?: AuthorizationUrlOptions,
  ): string;
  /**
   * Exchanges the callback's authorization code for the user's profile. With
   * `requireAuthTime`, a provider that `supportsReauth` also verifies its ID
   * token and fills `authTime`; without it no ID token is read, so a sign-in
   * never depends on the provider's signing keys being reachable.
   */
  exchangeCodeForProfile(
    code: string,
    redirectUri: string,
    codeVerifier: string,
    options?: { requireAuthTime?: boolean },
  ): Promise<OAuthProfile>;
}
