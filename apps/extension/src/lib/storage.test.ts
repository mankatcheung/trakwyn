import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { clearAuth, clearSessionAuth, getCachedUser, setAuth, setCachedUser } from './storage';
import { STORAGE_KEYS } from '../constants';

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
};

const auth = { token: 'tok', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 };

beforeEach(() => {
  fakeBrowser.reset();
});

describe('cached user (JEF-457)', () => {
  it('is kept in session storage, never local storage', async () => {
    await setCachedUser(user);

    expect(await getCachedUser()).toEqual(user);
    expect(await browser.storage.local.get(null)).toEqual({});
  });

  it('is null when nothing is cached', async () => {
    expect(await getCachedUser()).toBeNull();
  });

  it('reads an unexpected shape as nothing cached', async () => {
    await browser.storage.session.set({ [STORAGE_KEYS.CACHED_USER]: { id: 'u1' } });

    expect(await getCachedUser()).toBeNull();
  });

  it('is cleared on sign-out', async () => {
    await setAuth(auth, true);
    await setCachedUser(user);

    await clearAuth();

    expect(await getCachedUser()).toBeNull();
  });

  it('is cleared with the session when only the session is dropped', async () => {
    await setAuth(auth, true);
    await setCachedUser(user);

    await clearSessionAuth();

    expect(await getCachedUser()).toBeNull();
  });
});
