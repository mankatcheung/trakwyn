import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubOAuthProvider } from '#src/infrastructure/auth/GitHubOAuthProvider.js';

describe('GitHubOAuthProvider', () => {
  beforeEach(() => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'client-secret';
  });

  afterEach(() => {
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  describe('getAuthorizationUrl', () => {
    it('builds a GitHub authorization URL carrying the client id, redirect, and state', () => {
      const provider = new GitHubOAuthProvider();
      const url = new URL(
        provider.getAuthorizationUrl('my-state', 'https://api/cb', 'my-challenge'),
      );

      expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://api/cb');
      expect(url.searchParams.get('state')).toBe('my-state');
    });

    it('sends the PKCE challenge and names S256 as the method', () => {
      // GitHub accepts S256 only (PKCE shipped for OAuth Apps in July 2025).
      const provider = new GitHubOAuthProvider();
      const url = new URL(
        provider.getAuthorizationUrl('my-state', 'https://api/cb', 'my-challenge'),
      );

      expect(url.searchParams.get('code_challenge')).toBe('my-challenge');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('exchangeCodeForProfile', () => {
    const githubFetch = (emails: unknown, emailsOk = true) =>
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 42, name: 'Jeff Man', email: 'public@example.com' }),
        })
        .mockResolvedValueOnce({ ok: emailsOk, json: async () => emails });

    const exchange = () =>
      new GitHubOAuthProvider().exchangeCodeForProfile(
        'auth-code',
        'https://api/cb',
        'my-verifier',
      );

    it('takes the verified primary address from /user/emails', async () => {
      const mockFetch = githubFetch([
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
      ]);
      vi.stubGlobal('fetch', mockFetch);

      expect(await exchange()).toEqual({
        providerAccountId: '42',
        email: 'primary@example.com',
        emailVerified: true,
        name: 'Jeff Man',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('ignores the public profile email even when /user returns one', async () => {
      vi.stubGlobal(
        'fetch',
        githubFetch([{ email: 'primary@example.com', primary: true, verified: true }]),
      );

      expect((await exchange()).email).toBe('primary@example.com');
    });

    it('reports no email when the primary address is not verified', async () => {
      vi.stubGlobal(
        'fetch',
        githubFetch([{ email: 'primary@example.com', primary: true, verified: false }]),
      );

      const profile = await exchange();

      expect(profile.email).toBeNull();
      expect(profile.emailVerified).toBe(false);
    });

    it('reports no email when /user/emails is refused', async () => {
      vi.stubGlobal('fetch', githubFetch({ message: 'Forbidden' }, false));

      const profile = await exchange();

      expect(profile.email).toBeNull();
      expect(profile.emailVerified).toBe(false);
    });

    it('throws when the token exchange returns no access_token', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => ({ error: 'bad_verification_code' }) }),
      );
      const provider = new GitHubOAuthProvider();

      await expect(
        provider.exchangeCodeForProfile('bad-code', 'https://api/cb', 'my-verifier'),
      ).rejects.toThrow('GitHub token exchange failed');
    });
  });
});
