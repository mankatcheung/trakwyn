import { describe, it, expect, vi } from 'vitest';
import { ReauthenticateWithOAuthUseCase } from '#src/use-cases/oauth/ReauthenticateWithOAuthUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
  makeOAuthProvider,
} from '#src/__tests__/helpers/mocks/oauth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IOAuthProvider } from '#src/use-cases/ports/IOAuthProvider.js';
import { REAUTH } from '#src/use-cases/constants.js';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const input = {
  userId: 'user-1',
  provider: 'google' as const,
  code: 'auth-code',
  redirectUri: 'https://api.example/cb',
  codeVerifier: 'verifier',
};

const profileWith = (authTime: Date | null) => ({
  providerAccountId: 'google-sub-1',
  email: 'test@example.com',
  emailVerified: true,
  name: null,
  authTime,
});

const build = (provider: IOAuthProvider, linkedTo = 'user-1') => {
  const deps = {
    oauthProviderRegistry: { get: () => provider },
    oauthAccountRepository: makeOAuthAccountRepository({
      findByProvider: vi.fn().mockResolvedValue(makeOAuthAccount({ userId: linkedTo })),
    }),
    userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
    now: () => NOW,
  };
  return { deps, useCase: new ReauthenticateWithOAuthUseCase(deps) };
};

describe('ReauthenticateWithOAuthUseCase', () => {
  it('accepts a fresh sign-in to the linked account, asking the provider for auth_time', async () => {
    const provider = makeOAuthProvider({
      exchangeCodeForProfile: vi
        .fn()
        .mockResolvedValue(profileWith(new Date(NOW.getTime() - 1000))),
    });
    const { deps, useCase } = build(provider);

    const user = await useCase.execute(input);

    expect(user.id).toBe('user-1');
    expect(provider.exchangeCodeForProfile).toHaveBeenCalledWith(
      'auth-code',
      'https://api.example/cb',
      'verifier',
      { requireAuthTime: true },
    );
    expect(deps.oauthAccountRepository.findByProvider).toHaveBeenCalledWith(
      'google',
      'google-sub-1',
    );
  });

  it('refuses a provider that cannot prove a fresh sign-in, before talking to it', async () => {
    const provider = makeOAuthProvider({ supportsReauth: false });
    const { useCase } = build(provider);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(provider.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('refuses a fresh sign-in to an account linked to someone else', async () => {
    const provider = makeOAuthProvider({
      exchangeCodeForProfile: vi.fn().mockResolvedValue(profileWith(NOW)),
    });
    const { useCase } = build(provider, 'user-2');

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses a sign-in older than the allowed age', async () => {
    const stale = new Date(NOW.getTime() - REAUTH.OIDC_MAX_AUTH_AGE_MS - 1);
    const provider = makeOAuthProvider({
      exchangeCodeForProfile: vi.fn().mockResolvedValue(profileWith(stale)),
    });

    await expect(build(provider).useCase.execute(input)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses when the provider did not say when it authenticated', async () => {
    const provider = makeOAuthProvider({
      exchangeCodeForProfile: vi.fn().mockResolvedValue(profileWith(null)),
    });

    await expect(build(provider).useCase.execute(input)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
