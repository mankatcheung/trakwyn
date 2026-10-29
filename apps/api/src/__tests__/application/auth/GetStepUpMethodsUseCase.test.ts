import { describe, it, expect, vi } from 'vitest';
import { GetStepUpMethodsUseCase } from '#src/use-cases/auth/GetStepUpMethodsUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
  makeOAuthProvider,
} from '#src/__tests__/helpers/mocks/oauth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';

const registry = {
  get: (provider: OAuthProviderName) =>
    makeOAuthProvider({ supportsReauth: provider === 'google' }),
};

const build = (passwordHash: string | null, providers: OAuthProviderName[]) =>
  new GetStepUpMethodsUseCase({
    userRepository: makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ passwordHash })),
    }),
    oauthAccountRepository: makeOAuthAccountRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(providers.map((provider) => makeOAuthAccount({ provider }))),
    }),
    oauthProviderRegistry: registry,
  });

describe('GetStepUpMethodsUseCase', () => {
  it('offers only the password when the account has one, even with Google linked', async () => {
    expect(await build('hashed', ['google']).execute('user-1')).toEqual(['password']);
  });

  it('offers Google, then the mailed code, to a Google-only account', async () => {
    expect(await build(null, ['google']).execute('user-1')).toEqual(['google', 'email_code']);
  });

  it('offers only the mailed code to a GitHub-only account, since GitHub cannot prove a fresh sign-in', async () => {
    expect(await build(null, ['github']).execute('user-1')).toEqual(['email_code']);
  });

  it('offers nothing for a user who no longer exists', async () => {
    const useCase = new GetStepUpMethodsUseCase({
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(null) }),
      oauthAccountRepository: makeOAuthAccountRepository(),
      oauthProviderRegistry: registry,
    });

    expect(await useCase.execute('gone')).toEqual([]);
  });
});
