import { describe, it, expect, vi } from 'vitest';
import { AccountDeletionResolver } from '#src/interface-adapters/resolvers/AccountDeletionResolver.js';

const makeDeps = () => ({
  requestAccountDeletionUseCase: { execute: vi.fn().mockResolvedValue(undefined) },
  confirmAccountDeletionUseCase: {
    execute: vi.fn().mockResolvedValue({ deletionScheduledAt: new Date('2026-11-12T00:00:00Z') }),
  },
  cancelAccountDeletionUseCase: { execute: vi.fn().mockResolvedValue(undefined) },
});

describe('AccountDeletionResolver (JEF-463)', () => {
  it('passes a deletion request straight through', async () => {
    const deps = makeDeps();
    const input = { userId: 'user-1', authTime: 1_700_000_000_000, legacyPassword: 'secret' };

    await new AccountDeletionResolver(deps).request(input);

    expect(deps.requestAccountDeletionUseCase.execute).toHaveBeenCalledWith(input);
  });

  it('returns the scheduled date from a confirmation', async () => {
    const deps = makeDeps();

    const date = await new AccountDeletionResolver(deps).confirm('raw-token');

    expect(deps.confirmAccountDeletionUseCase.execute).toHaveBeenCalledWith({ token: 'raw-token' });
    expect(date).toEqual(new Date('2026-11-12T00:00:00Z'));
  });

  it('passes a cancellation straight through', async () => {
    const deps = makeDeps();

    await new AccountDeletionResolver(deps).cancel({ token: 'raw-token' });

    expect(deps.cancelAccountDeletionUseCase.execute).toHaveBeenCalledWith({ token: 'raw-token' });
  });
});
