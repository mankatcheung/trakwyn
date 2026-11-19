import { describe, it, expect, vi } from 'vitest';
import { UnlinkOAuthAccountUseCase } from '#src/use-cases/oauth/UnlinkOAuthAccountUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
} from '#src/__tests__/helpers/mocks/oauth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const input = { userId: 'user-1', provider: 'google' as const };

describe('UnlinkOAuthAccountUseCase', () => {
  it('is an idempotent no-op when the provider is not linked', async () => {
    const oauthAccountRepository = makeOAuthAccountRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const useCase = new UnlinkOAuthAccountUseCase({
      userRepository: makeUserRepository(),
      oauthAccountRepository,
    });

    await expect(useCase.execute(input)).resolves.toBeUndefined();
    expect(oauthAccountRepository.delete).not.toHaveBeenCalled();
  });

  it('deletes the link when the user has a password as a fallback sign-in method', async () => {
    const link = makeOAuthAccount({ id: 'link-1', provider: 'google', userId: 'user-1' });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findAllByUserId: vi.fn().mockResolvedValue([link]),
    });
    const useCase = new UnlinkOAuthAccountUseCase({
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: 'hashed' })),
      }),
      oauthAccountRepository,
    });

    await useCase.execute(input);

    expect(oauthAccountRepository.delete).toHaveBeenCalledWith('link-1');
  });

  it('deletes the link when another linked provider remains as a fallback', async () => {
    const googleLink = makeOAuthAccount({ id: 'link-1', provider: 'google', userId: 'user-1' });
    const githubLink = makeOAuthAccount({ id: 'link-2', provider: 'github', userId: 'user-1' });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findAllByUserId: vi.fn().mockResolvedValue([googleLink, githubLink]),
    });
    const useCase = new UnlinkOAuthAccountUseCase({
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
      }),
      oauthAccountRepository,
    });

    await useCase.execute(input);

    expect(oauthAccountRepository.delete).toHaveBeenCalledWith('link-1');
  });

  it('throws VALIDATION when unlinking would remove the only sign-in method', async () => {
    const link = makeOAuthAccount({ id: 'link-1', provider: 'google', userId: 'user-1' });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findAllByUserId: vi.fn().mockResolvedValue([link]),
    });
    const useCase = new UnlinkOAuthAccountUseCase({
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
      }),
      oauthAccountRepository,
    });

    const err = await useCase.execute(input).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(oauthAccountRepository.delete).not.toHaveBeenCalled();
  });
});
