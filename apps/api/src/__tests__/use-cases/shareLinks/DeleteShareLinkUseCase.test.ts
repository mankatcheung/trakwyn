import { describe, it, expect, vi } from 'vitest';
import { DeleteShareLinkUseCase } from '#src/use-cases/shareLinks/DeleteShareLinkUseCase.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';

describe('DeleteShareLinkUseCase', () => {
  it('throws NOT_FOUND when the link does not belong to the user', async () => {
    const repo = makeShareLinkRepository({ findByIdAndUserId: vi.fn().mockResolvedValue(null) });
    const useCase = new DeleteShareLinkUseCase({ shareLinkRepository: repo });

    const err = await useCase.execute('share-link-1', 'user-1').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('deletes the link when it belongs to the user', async () => {
    const link = makeShareLink();
    const repo = makeShareLinkRepository({
      findByIdAndUserId: vi.fn().mockResolvedValue(link),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteShareLinkUseCase({ shareLinkRepository: repo });

    await useCase.execute('share-link-1', 'user-1');

    expect(repo.delete).toHaveBeenCalledWith('share-link-1');
  });
});
