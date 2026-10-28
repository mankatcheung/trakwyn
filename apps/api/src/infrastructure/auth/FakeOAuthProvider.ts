import type {
  AuthorizationUrlOptions,
  IOAuthProvider,
  OAuthProfile,
} from '#src/use-cases/ports/IOAuthProvider.js';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import { FAKE_OAUTH } from '#src/infrastructure/config/constants.js';

/**
 * A same-origin stand-in for Google/GitHub, selected by
 * `OAUTH_PROVIDER_MODE=fake` (mirrors `EMAIL_PROVIDER=console` and
 * `STORAGE_PROVIDER=local`). `getAuthorizationUrl` points at this server's own
 * fake consent route (`http/routes/fakeOAuthConsent.routes.ts`, registered
 * only in that same mode) instead of a real provider, so e2e tests can drive
 * the whole browser round trip — real redirect, real PKCE/state cookie, real
 * callback handler — without a live Google/GitHub dependency or secrets in
 * CI.
 *
 * `exchangeCodeForProfile` decodes the profile the consent route encoded into
 * the code itself, so no state needs to be shared between the two requests,
 * and makes no network call at all — the one thing that would be genuinely
 * unreachable from a CI runner anyway.
 */
abstract class FakeOAuthProvider implements IOAuthProvider {
  protected abstract readonly provider: OAuthProviderName;
  abstract readonly supportsReauth: boolean;

  // redirectUri/codeChallenge are part of IOAuthProvider's contract (every
  // real caller — oauth.routes.ts — passes all three) but unused here: the
  // fake consent route derives its own redirect_uri, and there is no real
  // token exchange for a challenge to protect.
  getAuthorizationUrl(
    state: string,
    _redirectUri: string,
    _codeChallenge: string,
    _options?: AuthorizationUrlOptions,
  ): string {
    const params = new URLSearchParams({ provider: this.provider, state });
    return `${FAKE_OAUTH.CONSENT_PATH}?${params.toString()}`;
  }

  // The consent screen stands in for the user signing in, so a step-up that
  // reaches the exchange has just "authenticated" (JEF-463) — but only for a
  // provider that could report it, mirroring the real pair.
  async exchangeCodeForProfile(
    code: string,
    _redirectUri: string,
    _codeVerifier: string,
    options: { requireAuthTime?: boolean } = {},
  ): Promise<OAuthProfile> {
    const profile = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as OAuthProfile;
    if (!options.requireAuthTime) return profile;
    return { ...profile, authTime: this.supportsReauth ? new Date() : null };
  }
}

export class FakeGoogleOAuthProvider extends FakeOAuthProvider {
  protected readonly provider: OAuthProviderName = 'google';
  readonly supportsReauth = true;
}

export class FakeGitHubOAuthProvider extends FakeOAuthProvider {
  protected readonly provider: OAuthProviderName = 'github';
  readonly supportsReauth = false;
}
