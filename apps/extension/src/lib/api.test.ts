import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  ApiError,
  getCurrentUser,
  hasDefaultAiKey,
  isUnauthorizedError,
  parseJobDescription,
} from './api';
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
  vi.mocked(getAuth).mockResolvedValue({
    token: 'tok',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 10 * 60_000,
  });
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

describe('parseJobDescription', () => {
  it('sends the text and returns the parsed fields', async () => {
    const parsed = { company: 'Acme', role: 'Engineer', location: null, description: 'Text' };
    respondWith({ data: { parseJobDescription: parsed } });

    await expect(parseJobDescription('Acme is hiring')).resolves.toEqual(parsed);

    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body).variables).toEqual({ text: 'Acme is hiring' });
  });

  it.each([
    ['AI_NOT_CONFIGURED', /provider key/],
    ['AI_LIMIT_REACHED', /monthly token limit/],
    ['AI_PROVIDER_ERROR', /provider returned an error/],
    ['RATE_LIMITED', /too quickly/],
  ])('maps %s to readable copy and keeps the code', async (code, copy) => {
    respondWith({ data: null, errors: [{ message: 'raw', extensions: { code } }] });

    const err = await parseJobDescription('x').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).message).toMatch(copy);
  });

  it('passes other errors through unchanged', async () => {
    respondWith({
      data: null,
      errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }],
    });

    const err = await parseJobDescription('x').catch((e: unknown) => e);

    expect(isUnauthorizedError(err)).toBe(true);
  });
});

describe('hasDefaultAiKey', () => {
  const answer = (defaultLlmProvider: string | null, providers: string[]) =>
    respondWith({
      data: {
        me: { defaultLlmProvider },
        llmApiKeys: providers.map((provider) => ({ provider })),
      },
    });

  it('is true when the default provider has a saved key', async () => {
    answer('anthropic', ['openai', 'anthropic']);

    await expect(hasDefaultAiKey()).resolves.toBe(true);
  });

  it('is false when no default provider is set', async () => {
    answer(null, ['anthropic']);

    await expect(hasDefaultAiKey()).resolves.toBe(false);
  });

  it('is false when the default provider has no saved key', async () => {
    answer('anthropic', ['openai']);

    await expect(hasDefaultAiKey()).resolves.toBe(false);
  });
});
