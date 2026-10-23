import { describe, it, expect, vi } from 'vitest';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { CreateShareLinkUseCase } from '#src/use-cases/shareLinks/CreateShareLinkUseCase.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';

describe('CreateShareLinkUseCase', () => {
  it('generates a token with jfsl_ prefix and stores its hash', async () => {
    const storedLink = makeShareLink();
    const repo = makeShareLinkRepository({ create: vi.fn().mockResolvedValue(storedLink) });
    const generateId = vi.fn().mockReturnValue('share-link-1');
    const useCase = new CreateShareLinkUseCase({
      entitlementService: makeEntitlementService(),
      shareLinkRepository: repo,
      generateId,
    });

    const { rawToken, shareLink } = await useCase.execute({
      userId: 'user-1',
      name: 'For my mentor',
    });

    expect(rawToken).toMatch(/^jfsl_/);
    expect(shareLink.id).toBe('share-link-1');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'For my mentor',
        tokenHash: expect.any(String),
      }),
    );
    // Hash must NOT equal raw token
    const call = vi.mocked(repo.create).mock.calls[0][0];
    expect(call.tokenHash).not.toBe(rawToken);
  });

  it('each call produces a unique raw token', async () => {
    const repo = makeShareLinkRepository({ create: vi.fn().mockResolvedValue(makeShareLink()) });
    const useCase = new CreateShareLinkUseCase({
      entitlementService: makeEntitlementService(),
      shareLinkRepository: repo,
      generateId: vi.fn(),
    });

    const [a, b] = await Promise.all([
      useCase.execute({ userId: 'user-1', name: 'A' }),
      useCase.execute({ userId: 'user-1', name: 'B' }),
    ]);

    expect(a.rawToken).not.toBe(b.rawToken);
  });
});
