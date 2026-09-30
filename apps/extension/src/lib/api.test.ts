import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiError, getCurrentUser, isUnauthorizedError } from './api';
import { getAuth } from './storage';

vi.mock('./storage', () => ({
  getAuth: vi.fn(),
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  getApiUrl: vi.fn(async () => 'https://api.example.com/graphql'),
}));

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: 'https://blob.example.com/avatar.png',
};

function respondWith(body: unknown) {
  (globalThis.fetch as Mock).mockResolvedValueOnce({ json: async () => body });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(getAuth).mockResolvedValue({ token: 'tok', expiresAt: Date.now() + 60_000 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCurrentUser', () => {
  it('queries `me` with the stored bearer token and returns the user', async () => {
    respondWith({ data: { me: user } });

    await expect(getCurrentUser()).resolves.toEqual(user);

    const [url, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/graphql');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body).query).toContain('me { id email name avatarUrl }');
  });

  it('throws an unauthorized ApiError carrying the API error code', async () => {
    respondWith({
      data: null,
      errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }],
    });

    const err = await getCurrentUser().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(isUnauthorizedError(err)).toBe(true);
  });

  it('treats a null `me` as unauthorized', async () => {
    respondWith({ data: { me: null } });

    expect(isUnauthorizedError(await getCurrentUser().catch((e: unknown) => e))).toBe(true);
  });

  it('is unauthorized without calling the API when no token is stored', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);

    expect(isUnauthorizedError(await getCurrentUser().catch((e: unknown) => e))).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps other API errors distinct from unauthorized', async () => {
    respondWith({ errors: [{ message: 'Boom', extensions: { code: 'INTERNAL_ERROR' } }] });

    const err = await getCurrentUser().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Boom');
    expect(isUnauthorizedError(err)).toBe(false);
  });
});

describe('isUnauthorizedError', () => {
  it('is false for plain errors', () => {
    expect(isUnauthorizedError(new Error('UNAUTHORIZED'))).toBe(false);
  });
});
