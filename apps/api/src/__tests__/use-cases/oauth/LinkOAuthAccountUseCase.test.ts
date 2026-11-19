import { describe, it, expect, vi } from 'vitest';
import { LinkOAuthAccountUseCase } from '#src/use-cases/oauth/LinkOAuthAccountUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
  makeOAuthProviderRegistry,
} from '#src/__tests__/helpers/mocks/oauth.js';

const input = {
  userId: 'user-1',
  provider: 'google' as const,
  code: 'auth-code',
  redirectUri: 'https://api/cb',
  codeVerifier: 'test-verifier',
};

describe('LinkOAuthAccountUseCase', () => {
  it('creates a new link when the identity is not linked to anyone', async () => {
    const oauthAccountRepository = makeOAuthAccountRepository();
    const useCase = new LinkOAuthAccountUseCase({
      oauthAccountRepository,
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn().mockReturnValue('link-1'),
    });

    await useCase.execute(input);

    expect(oauthAccountRepository.create).toHaveBeenCalledWith({
      id: 'link-1',
      userId: 'user-1',
      provider: 'google',
      providerAccountId: 'google-sub-1',
      email: 'test@example.com',
    });
  });

  it('is a no-op when already linked to the same user', async () => {
    const existing = makeOAuthAccount({ userId: 'user-1' });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findByProvider: vi.fn().mockResolvedValue(existing),
    });
    const useCase = new LinkOAuthAccountUseCase({
      oauthAccountRepository,
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn(),
    });

    await expect(useCase.execute(input)).resolves.toBeUndefined();
    expect(oauthAccountRepository.create).not.toHaveBeenCalled();
  });

  it('throws CONFLICT when already linked to a different user', async () => {
    const existing = makeOAuthAccount({ userId: 'someone-else' });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findByProvider: vi.fn().mockResolvedValue(existing),
    });
    const useCase = new LinkOAuthAccountUseCase({
      oauthAccountRepository,
      oauthProviderRegistry: makeOAuthProviderRegistry(),
      generateId: vi.fn(),
    });

    const err = await useCase.execute(input).catch((e) => e);
    expect((err as { code: string }).code).toBe('CONFLICT');
    expect(oauthAccountRepository.create).not.toHaveBeenCalled();
  });
});
