import { describe, it, expect, beforeEach, vi } from 'vitest';
import { login, loginWithOAuth, refreshToken } from '../../lib/api';
import { OAuthCancelledError } from '../../lib/oauth';
import { getAuth, setAuth } from '../../lib/storage';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const REDIRECT = `https://${EXTENSION_ID}.chromiumapp.org/`;

/** A JWT-shaped token whose payload carries `exp` (seconds). */
function fakeJwt(expSeconds: number, tag = 'a'): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds, tag }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.sig`;
}

function fakeStorageArea() {
  let data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys: string | Record<string, unknown>) =>
      typeof keys === 'string' ? { [keys]: data[keys] } : { ...keys, ...data },
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      data = { ...data, ...items };
    }),
    remove: vi.fn(async (key: string) => {
      const { [key]: _removed, ...rest } = data;
      data = rest;
    }),
  };
}

const launchWebAuthFlow = vi.fn();
const fetchMock = vi.fn();

function graphqlResponse(data: unknown, errors?: Array<{ message: string }>) {
  return { json: async () => (errors ? { errors } : { data }) };
}

function lastRequest(): { query: string; variables: Record<string, unknown> } {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  launchWebAuthFlow.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('chrome', {
    runtime: { id: EXTENSION_ID, sendMessage: vi.fn() },
    identity: { launchWebAuthFlow },
    storage: { session: fakeStorageArea(), sync: fakeStorageArea() },
  });
});

describe('loginWithOAuth', () => {
  it('opens the API /start URL for this extension with a PKCE challenge', async () => {
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?oauthError=access_denied`);

    await loginWithOAuth('google').catch(() => undefined);

    const { url, interactive } = launchWebAuthFlow.mock.calls[0]![0];
    const startUrl = new URL(url);
    expect(interactive).toBe(true);
    expect(startUrl.pathname).toBe('/auth/oauth/google/start');
    expect(startUrl.searchParams.get('platform')).toBe('extension');
    expect(startUrl.searchParams.get('extensionId')).toBe(EXTENSION_ID);
    expect(startUrl.searchParams.get('codeChallenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('redeems the handoff code with the verifier and stores both tokens', async () => {
    const accessToken = fakeJwt(2_000_000_000);
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=handoff-code`);
    fetchMock.mockResolvedValue(
      graphqlResponse({ exchangeMobileOAuthCode: { accessToken, refreshToken: 'refresh-1' } }),
    );

    await loginWithOAuth('github');

    const { query, variables } = lastRequest();
    expect(query).toContain('exchangeMobileOAuthCode');
    expect(variables.code).toBe('handoff-code');
    expect(variables.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await getAuth()).toEqual({
      token: accessToken,
      refreshToken: 'refresh-1',
      expiresAt: 2_000_000_000 * 1000,
    });
  });

  it('reports a closed sign-in window as a cancel, not an error', async () => {
    launchWebAuthFlow.mockRejectedValue(new Error('The user did not approve access.'));

    await expect(loginWithOAuth('google')).rejects.toBeInstanceOf(OAuthCancelledError);
  });

  it("reports the provider's Cancel as a cancel, not an error", async () => {
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?oauthError=access_denied`);

    await expect(loginWithOAuth('google')).rejects.toBeInstanceOf(OAuthCancelledError);
  });

  it('turns an API error slug into a readable message and stores nothing', async () => {
    launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?oauthError=email_in_use`);

    await expect(loginWithOAuth('google')).rejects.toThrow(/already exists/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getAuth()).toBeNull();
  });

  it('explains a sign-in window that could not load', async () => {
    launchWebAuthFlow.mockRejectedValue(new Error('Authorization page could not be loaded.'));

    await expect(loginWithOAuth('google')).rejects.toThrow(/Couldn't open the sign-in window/);
  });
});

describe('login', () => {
  it('uses loginMobile and stores the refresh token alongside the access token', async () => {
    const accessToken = fakeJwt(2_000_000_000);
    fetchMock.mockResolvedValue(
      graphqlResponse({
        loginMobile: { totpRequired: false, accessToken, refreshToken: 'refresh-1' },
      }),
    );

    await login('a@b.co', 'pw');

    expect(lastRequest().query).toContain('loginMobile');
    expect((await getAuth())?.refreshToken).toBe('refresh-1');
  });
});

describe('refreshToken', () => {
  beforeEach(async () => {
    await setAuth({ token: fakeJwt(1), refreshToken: 'refresh-1', expiresAt: 1000 });
  });

  it('presents the stored refresh token and stores the rotated pair', async () => {
    const accessToken = fakeJwt(2_000_000_000, 'b');
    fetchMock.mockResolvedValue(
      graphqlResponse({ refreshTokenMobile: { accessToken, refreshToken: 'refresh-2' } }),
    );

    expect(await refreshToken()).toBe(true);

    expect(lastRequest().variables).toEqual({ refreshToken: 'refresh-1' });
    expect(await getAuth()).toMatchObject({ token: accessToken, refreshToken: 'refresh-2' });
  });

  it('shares one round-trip between overlapping calls, so a rotated token is never replayed', async () => {
    fetchMock.mockResolvedValue(
      graphqlResponse({
        refreshTokenMobile: { accessToken: fakeJwt(2_000_000_000), refreshToken: 'refresh-2' },
      }),
    );

    await Promise.all([refreshToken(), refreshToken(), refreshToken()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh token is refused', async () => {
    fetchMock.mockResolvedValue(graphqlResponse(null, [{ message: 'Invalid refresh token' }]));

    expect(await refreshToken()).toBe(false);

    expect(await getAuth()).toBeNull();
  });
});
