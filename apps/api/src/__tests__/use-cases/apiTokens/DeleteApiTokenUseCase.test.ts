import { describe, it, expect, vi } from 'vitest';
import { DeleteApiTokenUseCase } from '#src/use-cases/apiTokens/DeleteApiTokenUseCase.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';

describe('DeleteApiTokenUseCase', () => {
  it('throws NOT_FOUND when token does not belong to user', async () => {
    const repo = makeApiTokenRepository({ findByIdAndUserId: vi.fn().mockResolvedValue(null) });
    const useCase = new DeleteApiTokenUseCase({ apiTokenRepository: repo });

    const err = await useCase.execute('token-1', 'user-1').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('deletes the token when it belongs to the user', async () => {
    const token = makeApiToken();
    const repo = makeApiTokenRepository({
      findByIdAndUserId: vi.fn().mockResolvedValue(token),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteApiTokenUseCase({ apiTokenRepository: repo });

    await useCase.execute('token-1', 'user-1');

    expect(repo.delete).toHaveBeenCalledWith('token-1');
  });
});
