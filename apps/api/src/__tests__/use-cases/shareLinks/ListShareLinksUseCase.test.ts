import { describe, it, expect, vi } from 'vitest';
import { ListShareLinksUseCase } from '#src/use-cases/shareLinks/ListShareLinksUseCase.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';

describe('ListShareLinksUseCase', () => {
  it('returns all share links for the given user', async () => {
    const links = [makeShareLink({ id: 'share-link-1' }), makeShareLink({ id: 'share-link-2' })];
    const shareLinkRepository = makeShareLinkRepository({
      findAllByUserId: vi.fn().mockResolvedValue(links),
    });

    const useCase = new ListShareLinksUseCase({ shareLinkRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual(links);
    expect(shareLinkRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
  });

  it('returns an empty array when the user has no share links', async () => {
    const shareLinkRepository = makeShareLinkRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new ListShareLinksUseCase({ shareLinkRepository });
    const result = await useCase.execute('user-1');

    expect(result).toEqual([]);
  });
});
