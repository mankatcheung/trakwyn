import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type {
  AuthorizationUrlOptions,
  IOAuthProvider,
  OAuthProfile,
} from '#src/use-cases/ports/IOAuthProvider.js';
import { ENV, GOOGLE_OIDC, OAUTH } from '#src/infrastructure/config/constants.js';

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export interface GoogleOAuthProviderOptions {
  /** Google's signing keys; a test passes its own. */
  keys?: JWTVerifyGetKey;
}

export class GoogleOAuthProvider implements IOAuthProvider {
  /** Google honours `max_age` and reports `auth_time` in the ID token (JEF-463). */
  readonly supportsReauth = true;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly keys: JWTVerifyGetKey;

  constructor(options: GoogleOAuthProviderOptions = {}) {
    this.clientId = process.env[ENV.GOOGLE_OAUTH_CLIENT_ID] ?? '';
    this.clientSecret = process.env[ENV.GOOGLE_OAUTH_CLIENT_SECRET] ?? '';
    this.keys = options.keys ?? createRemoteJWKSet(new URL(GOOGLE_OIDC.JWKS_URL));
  }

  getAuthorizationUrl(
    state: string,
    redirectUri: string,
    codeChallenge: string,
    options: AuthorizationUrlOptions = {},
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    // `max_age=0` makes Google authenticate the user again and put the time
    // it did in `auth_time`. `prompt=login` is not used: Google does not
    // document it.
    if (options.forceReauth) params.set('max_age', '0');
    return `${OAUTH.GOOGLE_AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeCodeForProfile(
    code: string,
    redirectUri: string,
    codeVerifier: string,
    options: { requireAuthTime?: boolean } = {},
  ): Promise<OAuthProfile> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(`${ENV.GOOGLE_OAUTH_CLIENT_ID}/${ENV.GOOGLE_OAUTH_CLIENT_SECRET} not set`);
    }

    const tokenResponse = await fetch(OAUTH.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
    }
    const { access_token: accessToken, id_token: idToken } =
      (await tokenResponse.json()) as GoogleTokenResponse;

    const userInfoResponse = await fetch(OAUTH.GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userInfoResponse.ok) {
      throw new Error(`Google userinfo fetch failed: ${userInfoResponse.status}`);
    }
    const profile = (await userInfoResponse.json()) as GoogleUserInfo;

    return {
      providerAccountId: profile.sub,
      email: profile.email ?? null,
      emailVerified: profile.email_verified ?? false,
      name: profile.name ?? null,
      authTime: options.requireAuthTime ? await this.readAuthTime(idToken, profile.sub) : undefined,
    };
  }

  /**
   * The ID token's `auth_time`, after checking the token is Google's, for this
   * client and for the same person userinfo described. Null when Google did
   * not say, which a step-up treats as "not proven".
   */
  private async readAuthTime(idToken: string | undefined, sub: string): Promise<Date | null> {
    if (!idToken) return null;
    const { payload } = await jwtVerify(idToken, this.keys, {
      issuer: [...GOOGLE_OIDC.ISSUERS],
      audience: this.clientId,
      algorithms: [...GOOGLE_OIDC.ALGORITHMS],
    });
    if (payload.sub !== sub) throw new Error('Google ID token is for a different account');
    return typeof payload.auth_time === 'number' ? new Date(payload.auth_time * 1000) : null;
  }
}
