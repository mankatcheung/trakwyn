import { describe, expect, it, vi } from 'vitest';
import { RemoveBackupEmailUseCase } from '#src/use-cases/user/RemoveBackupEmailUseCase.js';
import {
  makeBackupEmailVerificationTokenRepository,
  makePasswordHasher,
} from '#src/__tests__/helpers/mocks/auth.js';
import {
  makeRateLimiter,
  makeTransactionManager,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('RemoveBackupEmailUseCase', () => {
  const input = { userId: 'user-1', currentPassword: 'Current-Passw0rd!', authTime: Date.now() };

  const build = (
    overrides: Partial<ConstructorParameters<typeof RemoveBackupEmailUseCase>[0]> = {},
  ) => {
    const deps = {
      passwordHasher: makePasswordHasher(),
      userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
      backupEmailVerificationTokenRepository: makeBackupEmailVerificationTokenRepository(),
      removeBackupEmailRateLimiter: makeRateLimiter(),
      ...overrides,
    };
    return { deps, useCase: new RemoveBackupEmailUseCase(deps) };
  };

  it('clears the address and deletes the pending confirmations', async () => {
    const { deps, useCase } = build();

    await useCase.execute(input);

    expect(deps.userRepository.update).toHaveBeenCalledWith('user-1', {
      backupEmail: null,
      backupEmailVerifiedAt: null,
    });
    expect(deps.backupEmailVerificationTokenRepository.deleteAllForUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('writes only inside a transaction (JEF-694)', async () => {
    const { deps, useCase } = build({
      transactionManager: makeTransactionManager({ run: vi.fn() }),
    });

    await useCase.execute(input);

    expect(deps.userRepository.update).not.toHaveBeenCalled();
    expect(deps.backupEmailVerificationTokenRepository.deleteAllForUser).not.toHaveBeenCalled();
  });

  it('refuses once the budget is spent, changing nothing', async () => {
    const { deps, useCase } = build({
      removeBackupEmailRateLimiter: makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) }),
    });

    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(deps.userRepository.update).not.toHaveBeenCalled();
  });
});
