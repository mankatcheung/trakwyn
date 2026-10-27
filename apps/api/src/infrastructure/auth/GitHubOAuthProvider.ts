import type { IOAuthProvider, OAuthProfile } from '#src/use-cases/ports/IOAuthProvider.js';
import { ENV, OAUTH } from '#src/infrastructure/config/constants.js';

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  id: number;
  name: string | null;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export class GitHubOAuthProvider implements IOAuthProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env[ENV.GITHUB_OAUTH_CLIENT_ID] ?? '';
    this.clientSecret = process.env[ENV.GITHUB_OAUTH_CLIENT_SECRET] ?? '';
  }

  getAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
      // GitHub shipped PKCE for OAuth Apps in July 2025 and accepts S256 only.
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${OAUTH.GITHUB_AUTHORIZATION_URL}?${params.toString()}`;
  }

  async exchangeCodeForProfile(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OAuthProfile> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(`${ENV.GITHUB_OAUTH_CLIENT_ID}/${ENV.GITHUB_OAUTH_CLIENT_SECRET} not set`);
    }

    const tokenResponse = await fetch(OAUTH.GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
    }
    const tokenJson = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!tokenJson.access_token) {
      throw new Error(`GitHub token exchange failed: ${tokenJson.error ?? 'no access_token'}`);
    }

    const authHeader = { Authorization: `Bearer ${tokenJson.access_token}` };
    const userResponse = await fetch(OAUTH.GITHUB_USER_URL, { headers: authHeader });
    if (!userResponse.ok) {
      throw new Error(`GitHub user fetch failed: ${userResponse.status}`);
    }
    const user = (await userResponse.json()) as GitHubUser;

    // Always from /user/emails and never the profile's public `email` (JEF-438):
    // that one is whatever the user chose to show, while the account is claimed
    // by an address GitHub has verified, so only the verified primary counts.
    // None (or a refused lookup) leaves the profile without an email, which the
    // sign-in use case turns into a clear error.
    let email: string | null = null;
    const emailsResponse = await fetch(OAUTH.GITHUB_EMAILS_URL, { headers: authHeader });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as GitHubEmail[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
    const emailVerified = email !== null;

    return {
      providerAccountId: String(user.id),
      email,
      emailVerified,
      name: user.name,
    };
  }
}
