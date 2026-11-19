import { describe, it, expect, vi } from 'vitest';
import { ListApiTokensUseCase } from '#src/use-cases/apiTokens/ListApiTokensUseCase.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';

describe('ListApiTokensUseCase', () => {
  it('returns all tokens for the given user', async () => {
    const tokens = [makeApiToken({ id: 'token-1' }), makeApiToken({ id: 'token-2' })];
    const apiTokenRepository = makeApiTokenRepository({
      findAllByUserId: vi.fn().mockResolvedValue(tokens),
    });

    const useCase = new ListApiTokensUseCase({ apiTokenRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual(tokens);
    expect(apiTokenRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
  });

  it('returns an empty array when the user has no tokens', async () => {
    const apiTokenRepository = makeApiTokenRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new ListApiTokensUseCase({ apiTokenRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual([]);
  });
});
