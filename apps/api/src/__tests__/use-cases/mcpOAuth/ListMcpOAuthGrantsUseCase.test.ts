import { describe, expect, it, vi } from 'vitest';
import { ListMcpOAuthGrantsUseCase } from '#src/use-cases/mcpOAuth/ListMcpOAuthGrantsUseCase.js';

describe('ListMcpOAuthGrantsUseCase', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');

  it("asks only for the calling user's grants, as of now", async () => {
    const repository = { findActiveByUserId: vi.fn().mockResolvedValue([]) };
    const useCase = new ListMcpOAuthGrantsUseCase({
      mcpOAuthGrantRepository: repository as never,
      now: () => now,
    });

    await useCase.execute('user-1');

    // `now` is passed rather than read inside the repository so expiry is
    // decided by one clock the tests can control.
    expect(repository.findActiveByUserId).toHaveBeenCalledWith('user-1', now);
  });

  it('passes the grants straight through', async () => {
    const grants = [{ id: 'grant-1' }];
    const useCase = new ListMcpOAuthGrantsUseCase({
      mcpOAuthGrantRepository: { findActiveByUserId: vi.fn().mockResolvedValue(grants) } as never,
      now: () => now,
    });

    await expect(useCase.execute('user-1')).resolves.toBe(grants);
  });
});
