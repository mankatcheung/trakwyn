import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthProvider } from '#src/infrastructure/auth/GoogleOAuthProvider.js';
import { createOidcTestKeys } from '#src/__tests__/helpers/oidcTokens.js';

describe('GoogleOAuthProvider', () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
  });

  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  describe('getAuthorizationUrl', () => {
    it('builds a Google authorization URL carrying the client id, redirect, and state', () => {
      const provider = new GoogleOAuthProvider();
      const url = new URL(
        provider.getAuthorizationUrl('my-state', 'https://api/cb', 'my-challenge'),
      );

      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://api/cb');
      expect(url.searchParams.get('state')).toBe('my-state');
      expect(url.searchParams.get('scope')).toContain('email');
    });

    it('sends the PKCE challenge and names S256 as the method', () => {
      const provider = new GoogleOAuthProvider();
      const url = new URL(
        provider.getAuthorizationUrl('my-state', 'https://api/cb', 'my-challenge'),
      );

      expect(url.searchParams.get('code_challenge')).toBe('my-challenge');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('exchangeCodeForProfile', () => {
    it('exchanges the code for a token then fetches and maps the profile', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: 'google-sub-1',
            email: 'jeff@example.com',
            email_verified: true,
            name: 'Jeff Man',
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new GoogleOAuthProvider();
      const profile = await provider.exchangeCodeForProfile(
        'auth-code',
        'https://api/cb',
        'my-verifier',
      );

      expect(profile).toEqual({
        providerAccountId: 'google-sub-1',
        email: 'jeff@example.com',
        emailVerified: true,
        name: 'Jeff Man',
      });
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when the token exchange fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
      const provider = new GoogleOAuthProvider();

      await expect(
        provider.exchangeCodeForProfile('bad-code', 'https://api/cb', 'my-verifier'),
      ).rejects.toThrow('Google token exchange failed');
    });

    it('throws when client credentials are not configured', async () => {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      const provider = new GoogleOAuthProvider();

      await expect(
        provider.exchangeCodeForProfile('code', 'https://api/cb', 'my-verifier'),
      ).rejects.toThrow('not set');
    });
  });
  it('sends the code_verifier in the token exchange', async () => {
    // Without this the challenge sent at /start is decorative — the provider
    // has nothing to check it against.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sub: '1', email: 'a@b.c' }) });
    vi.stubGlobal('fetch', mockFetch);

    await new GoogleOAuthProvider().exchangeCodeForProfile(
      'auth-code',
      'https://api/cb',
      'my-verifier',
    );

    const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('code_verifier')).toBe('my-verifier');
  });

  describe('step-up (JEF-463)', () => {
    const SUB = '1234567890';

    const stubGoogle = (idToken: string | undefined, sub = SUB) =>
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'tok', id_token: idToken }),
          })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ sub, email: 'a@b.c' }) }),
      );

    it('asks Google to authenticate again with max_age=0 only when told to', () => {
      const provider = new GoogleOAuthProvider();
      const plain = new URL(provider.getAuthorizationUrl('s', 'https://api/cb', 'c'));
      const reauth = new URL(
        provider.getAuthorizationUrl('s', 'https://api/cb', 'c', { forceReauth: true }),
      );

      expect(plain.searchParams.has('max_age')).toBe(false);
      expect(reauth.searchParams.get('max_age')).toBe('0');
      expect(provider.supportsReauth).toBe(true);
    });

    it('reads auth_time from a verified ID token when asked', async () => {
      const oidc = await createOidcTestKeys();
      const authTimeS = Math.floor(Date.now() / 1000) - 30;
      stubGoogle(await oidc.sign('a@b.c', 'client-id', { claims: { auth_time: authTimeS } }));

      const profile = await new GoogleOAuthProvider({ keys: oidc.keys }).exchangeCodeForProfile(
        'code',
        'https://api/cb',
        'verifier',
        { requireAuthTime: true },
      );

      expect(profile.authTime).toEqual(new Date(authTimeS * 1000));
    });

    it('does not read the ID token for a plain sign-in', async () => {
      const oidc = await createOidcTestKeys();
      stubGoogle('not-even-a-jwt');

      const profile = await new GoogleOAuthProvider({ keys: oidc.keys }).exchangeCodeForProfile(
        'code',
        'https://api/cb',
        'verifier',
      );

      expect(profile.authTime).toBeUndefined();
    });

    it('rejects an ID token issued for another client', async () => {
      const oidc = await createOidcTestKeys();
      stubGoogle(
        await oidc.sign('a@b.c', 'someone-else', {
          claims: { auth_time: 1 },
          audience: 'someone-else',
        }),
      );

      await expect(
        new GoogleOAuthProvider({ keys: oidc.keys }).exchangeCodeForProfile(
          'code',
          'https://api/cb',
          'verifier',
          { requireAuthTime: true },
        ),
      ).rejects.toThrow();
    });

    it('rejects an ID token for a different person than userinfo described', async () => {
      const oidc = await createOidcTestKeys();
      stubGoogle(await oidc.sign('a@b.c', 'client-id', { claims: { auth_time: 1 } }), 'other-sub');

      await expect(
        new GoogleOAuthProvider({ keys: oidc.keys }).exchangeCodeForProfile(
          'code',
          'https://api/cb',
          'verifier',
          { requireAuthTime: true },
        ),
      ).rejects.toThrow('different account');
    });

    it('reports no auth_time when Google sent no ID token', async () => {
      stubGoogle(undefined);

      const profile = await new GoogleOAuthProvider({
        keys: (await createOidcTestKeys()).keys,
      }).exchangeCodeForProfile('code', 'https://api/cb', 'verifier', { requireAuthTime: true });

      expect(profile.authTime).toBeNull();
    });
  });
});
