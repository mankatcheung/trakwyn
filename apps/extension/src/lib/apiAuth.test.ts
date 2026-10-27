import { describe, it, expect, afterEach, beforeEach, vi, type MockInstance } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getPopupBootstrap, login, loginWithOAuth, logout, refreshToken } from './api';
import { OAuthCancelledError } from './oauth';
import { registerTabOAuthListeners } from './tabOAuth';
import { getAuth, getPersistedRefreshToken, setAuth } from './storage';
import { RUNTIME_MESSAGES, STORAGE_KEYS } from '../constants';

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

const CHROME_IDENTITY = fakeBrowser.identity;
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
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'id', 'get').mockReturnValue(EXTENSION_ID);
  // Put back what the Safari tests remove; reset() does not.
  Reflect.set(fakeBrowser, 'identity', CHROME_IDENTITY);
  fakeBrowser.identity.launchWebAuthFlow = launchWebAuthFlow;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

describe('loginWithOAuth without identity (Safari)', () => {
  const DONE_URL = 'http://localhost:3001/auth/oauth/extension/done';

  beforeEach(() => {
    // Safari exposes no `identity` API at all.
    Reflect.deleteProperty(fakeBrowser, 'identity');
    registerTabOAuthListeners(async () => undefined);
  });

  async function openedTab(create: MockInstance<typeof browser.tabs.create>) {
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    return (await create.mock.results[0]!.value) as { id: number };
  }

  it('signs in in a tab and redeems the code from the API done page', async () => {
    const accessToken = fakeJwt(2_000_000_000);
    fetchMock.mockResolvedValue(
      graphqlResponse({ exchangeMobileOAuthCode: { accessToken, refreshToken: 'refresh-1' } }),
    );
    const create = vi.spyOn(browser.tabs, 'create');

    const login = loginWithOAuth('google');
    const tab = await openedTab(create);
    const startUrl = new URL(create.mock.calls[0]![0].url!);
    await fakeBrowser.tabs.onUpdated.trigger(tab.id, { url: `${DONE_URL}?code=handoff-code` }, {
      id: tab.id,
    } as Browser.tabs.Tab);
    await login;

    expect(startUrl.searchParams.get('platform')).toBe('extension-tab');
    expect(startUrl.searchParams.has('extensionId')).toBe(false);
    expect(lastRequest().variables.code).toBe('handoff-code');
    expect((await getAuth())?.refreshToken).toBe('refresh-1');
  });

  it('reports a closed sign-in tab as a cancel', async () => {
    const create = vi.spyOn(browser.tabs, 'create');

    const login = loginWithOAuth('github');
    const outcome = expect(login).rejects.toBeInstanceOf(OAuthCancelledError);
    const tab = await openedTab(create);
    await fakeBrowser.tabs.onRemoved.trigger(tab.id, { windowId: 1, isWindowClosing: false });

    await outcome;
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('Keep me signed in (JEF-421)', () => {
  const PERSISTED = STORAGE_KEYS.PERSISTED_REFRESH_TOKEN;
  const localStorage = () => fakeBrowser.storage.local.get(null);

  function loginResponse(accessToken: string, refreshToken = 'refresh-1') {
    return graphqlResponse({ loginMobile: { totpRequired: false, accessToken, refreshToken } });
  }

  function exchangeResponse() {
    return graphqlResponse({
      exchangeMobileOAuthCode: { accessToken: fakeJwt(2_000_000_000), refreshToken: 'oauth-1' },
    });
  }

  function refreshResponse(refreshToken: string, tag = 'b') {
    return graphqlResponse({
      refreshTokenMobile: { accessToken: fakeJwt(2_000_000_000, tag), refreshToken },
    });
  }

  describe('login', () => {
    it('persists only the refresh token when the box is ticked', async () => {
      const accessToken = fakeJwt(2_000_000_000);
      fetchMock.mockResolvedValue(loginResponse(accessToken));

      await login('a@b.co', 'pw', true);

      expect(await getPersistedRefreshToken()).toBe('refresh-1');
      expect(await localStorage()).toEqual({ [PERSISTED]: 'refresh-1' });
      expect(JSON.stringify(await localStorage())).not.toContain(accessToken);
    });

    it('writes nothing to storage.local when the box is not ticked', async () => {
      fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

      await login('a@b.co', 'pw');

      expect(await localStorage()).toEqual({});
      expect((await getAuth())?.refreshToken).toBe('refresh-1');
    });

    it('drops an earlier persisted token when the user signs in again without the box', async () => {
      await fakeBrowser.storage.local.set({ [PERSISTED]: 'old-refresh' });
      fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

      await login('a@b.co', 'pw', false);

      expect(await getPersistedRefreshToken()).toBeNull();
    });

    describe('access to storage.local', () => {
      // Content scripts can read storage.local unless it is restricted.
      const setAccessLevel = vi.fn();

      beforeEach(() => {
        setAccessLevel.mockReset().mockResolvedValue(undefined);
        Reflect.set(fakeBrowser.storage.local, 'setAccessLevel', setAccessLevel);
      });

      afterEach(() => {
        Reflect.deleteProperty(fakeBrowser.storage.local, 'setAccessLevel');
      });

      it('is limited to trusted contexts before the refresh token is written', async () => {
        const order: string[] = [];
        setAccessLevel.mockImplementation(async () => void order.push('restrict'));
        const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
        vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
          order.push('write');
          return set(items);
        });
        fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

        await login('a@b.co', 'pw', true);

        expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
        expect(order).toEqual(['restrict', 'write']);
      });

      it('is left alone when nothing is persisted', async () => {
        fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

        await login('a@b.co', 'pw');

        expect(setAccessLevel).not.toHaveBeenCalled();
      });

      it('still persists on a browser that cannot restrict it', async () => {
        Reflect.deleteProperty(fakeBrowser.storage.local, 'setAccessLevel');
        fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

        await login('a@b.co', 'pw', true);

        expect(await getPersistedRefreshToken()).toBe('refresh-1');
      });

      it('still persists when restricting it fails', async () => {
        setAccessLevel.mockRejectedValue(new Error('not supported'));
        fetchMock.mockResolvedValue(loginResponse(fakeJwt(2_000_000_000)));

        await login('a@b.co', 'pw', true);

        expect(await getPersistedRefreshToken()).toBe('refresh-1');
      });
    });

    it('persists after Google/GitHub sign-in when the box is ticked', async () => {
      launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=handoff-code`);
      fetchMock.mockResolvedValue(exchangeResponse());

      await loginWithOAuth('github', true);

      expect(await getPersistedRefreshToken()).toBe('oauth-1');
    });

    it('does not persist after Google/GitHub sign-in without the box', async () => {
      launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=handoff-code`);
      fetchMock.mockResolvedValue(exchangeResponse());

      await loginWithOAuth('github');

      expect(await localStorage()).toEqual({});
    });
  });

  describe('refreshToken', () => {
    it('overwrites the persisted token with the rotated one', async () => {
      await setAuth({ token: fakeJwt(1), refreshToken: 'refresh-1', expiresAt: 1000 }, true);
      fetchMock.mockResolvedValue(refreshResponse('refresh-2'));

      expect(await refreshToken()).toBe(true);

      expect(await getPersistedRefreshToken()).toBe('refresh-2');
      expect((await getAuth())?.refreshToken).toBe('refresh-2');
    });

    it('leaves storage.local empty for a session that was not persisted', async () => {
      await setAuth({ token: fakeJwt(1), refreshToken: 'refresh-1', expiresAt: 1000 });
      fetchMock.mockResolvedValue(refreshResponse('refresh-2'));

      await refreshToken();

      expect(await localStorage()).toEqual({});
    });

    it('restores the session from the persisted token after a browser restart', async () => {
      // A restart clears storage.session and leaves storage.local.
      await fakeBrowser.storage.local.set({ [PERSISTED]: 'refresh-1' });
      const accessToken = fakeJwt(2_000_000_000, 'c');
      fetchMock.mockResolvedValue(
        graphqlResponse({ refreshTokenMobile: { accessToken, refreshToken: 'refresh-2' } }),
      );

      expect(await getAuth()).toBeNull();
      expect(await refreshToken()).toBe(true);

      expect(lastRequest().variables).toEqual({ refreshToken: 'refresh-1' });
      expect(await getAuth()).toEqual({
        token: accessToken,
        refreshToken: 'refresh-2',
        expiresAt: 2_000_000_000 * 1000,
      });
      expect(await getPersistedRefreshToken()).toBe('refresh-2');
    });

    it('clears the session and the persisted token when the API refuses it', async () => {
      await setAuth({ token: fakeJwt(1), refreshToken: 'refresh-1', expiresAt: 1000 }, true);
      fetchMock.mockResolvedValue({
        json: async () => ({
          errors: [{ message: 'Session revoked or expired', extensions: { code: 'UNAUTHORIZED' } }],
        }),
      });

      expect(await refreshToken()).toBe(false);

      expect(await getAuth()).toBeNull();
      expect(await getPersistedRefreshToken()).toBeNull();
    });

    it('keeps the persisted token when the API is unreachable, so the next launch can retry', async () => {
      await fakeBrowser.storage.local.set({ [PERSISTED]: 'refresh-1' });
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      expect(await refreshToken()).toBe(false);

      expect(await getAuth()).toBeNull();
      expect(await getPersistedRefreshToken()).toBe('refresh-1');
    });

    it('does nothing with no session and no persisted token', async () => {
      expect(await refreshToken()).toBe(false);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getPopupBootstrap', () => {
    it('asks the background to restore a persisted session before calling the API', async () => {
      await fakeBrowser.storage.local.set({ [PERSISTED]: 'refresh-1' });
      // Stands in for the background worker's REFRESH_TOKEN handler.
      const sendMessage = (
        vi.spyOn(browser.runtime, 'sendMessage' as never) as unknown as MockInstance<
          (...args: unknown[]) => Promise<unknown>
        >
      ).mockImplementation(async () => refreshToken());
      fetchMock.mockResolvedValueOnce(refreshResponse('refresh-2'));
      fetchMock.mockResolvedValueOnce(
        graphqlResponse({ me: { id: 'u1', email: 'a@b.co', name: null, avatarUrl: null } }),
      );

      const { user } = await getPopupBootstrap();

      expect(sendMessage).toHaveBeenCalledWith({ type: RUNTIME_MESSAGES.REFRESH_TOKEN });
      expect(user.id).toBe('u1');
    });
  });

  describe('logout', () => {
    it('clears the session and the persisted token', async () => {
      await setAuth({ token: fakeJwt(1), refreshToken: 'refresh-1', expiresAt: 1000 }, true);

      await logout();

      expect(await getAuth()).toBeNull();
      expect(await localStorage()).toEqual({});
    });
  });
});
