import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { UpdatePasswordUseCase } from '#src/use-cases/user/UpdatePasswordUseCase.js';
import { makeSecurityEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const passwordHasher = makePasswordHasher();

function securityDeps() {
  return { securityEventRepository: makeSecurityEventRepository(), generateId: () => 'evt-1' };
}

describe('UpdatePasswordUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    userId: 'user-1',
    currentPassword: 'oldSecret123',
    newPassword: 'newSecret456',
  };

  it('updates the password hash when credentials are valid', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const updatePasswordRateLimiter = makeRateLimiter();
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    vi.mocked(passwordHasher.hash).mockResolvedValue('new-hash' as never);

    await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter,
      ...securityDeps(),
    }).execute(input);

    expect(updatePasswordRateLimiter.consume).toHaveBeenCalledWith('update-password:user:user-1');
    expect(passwordHasher.compare).toHaveBeenCalledWith(input.currentPassword, user.passwordHash);
    expect(passwordHasher.hash).toHaveBeenCalledWith(input.newPassword);
    expect(userRepository.update).toHaveBeenCalledWith('user-1', { passwordHash: 'new-hash' });
  });

  it('records a password_changed security event with the caller device info', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const securityEventRepository = makeSecurityEventRepository();
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    vi.mocked(passwordHasher.hash).mockResolvedValue('new-hash' as never);

    await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter: makeRateLimiter(),
      securityEventRepository,
      generateId: () => 'evt-1',
    }).execute({ ...input, ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0' });

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'evt-1',
      userId: 'user-1',
      eventType: 'password_changed',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    const err = await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter: makeRateLimiter(),
      ...securityDeps(),
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when current password is wrong', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
    });
    vi.mocked(passwordHasher.compare).mockResolvedValue(false as never);

    const err = await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter: makeRateLimiter(),
      ...securityDeps(),
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when the new password is too short', async () => {
    const userRepository = makeUserRepository();

    const err = await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter: makeRateLimiter(),
      ...securityDeps(),
    })
      .execute({ ...input, newPassword: 'short1' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws RATE_LIMITED when too many attempts have been made', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });
    const updatePasswordRateLimiter = makeRateLimiter({
      consume: vi.fn().mockReturnValue(false),
    });

    const err = await new UpdatePasswordUseCase({
      passwordHasher,
      userRepository,
      updatePasswordRateLimiter,
      ...securityDeps(),
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(updatePasswordRateLimiter.consume).toHaveBeenCalledWith('update-password:user:user-1');
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  describe('step-up freshness (JEF-44)', () => {
    it('throws STEP_UP_REQUIRED for a 2FA-enabled user with a stale session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

      const err = await new UpdatePasswordUseCase({
        passwordHasher,
        userRepository,
        updatePasswordRateLimiter: makeRateLimiter(),
        ...securityDeps(),
      })
        .execute({ ...input, authTime: Date.now() - 16 * 60 * 1000 })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('STEP_UP_REQUIRED');
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('succeeds for a 2FA-enabled user with a fresh session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      });
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
      vi.mocked(passwordHasher.hash).mockResolvedValue('new-hash' as never);

      await new UpdatePasswordUseCase({
        passwordHasher,
        userRepository,
        updatePasswordRateLimiter: makeRateLimiter(),
        ...securityDeps(),
      }).execute({ ...input, authTime: Date.now() });

      expect(userRepository.update).toHaveBeenCalledWith('user-1', { passwordHash: 'new-hash' });
    });

    it('does not require freshness for a non-2FA user, even with a stale/missing authTime', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: false });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      });
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
      vi.mocked(passwordHasher.hash).mockResolvedValue('new-hash' as never);

      await new UpdatePasswordUseCase({
        passwordHasher,
        userRepository,
        updatePasswordRateLimiter: makeRateLimiter(),
        ...securityDeps(),
      }).execute({ ...input, authTime: undefined });

      expect(userRepository.update).toHaveBeenCalledWith('user-1', { passwordHash: 'new-hash' });
    });

    it('does not require freshness for API-token auth (authTime: null)', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      });
      vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
      vi.mocked(passwordHasher.hash).mockResolvedValue('new-hash' as never);

      await new UpdatePasswordUseCase({
        passwordHasher,
        userRepository,
        updatePasswordRateLimiter: makeRateLimiter(),
        ...securityDeps(),
      }).execute({ ...input, authTime: null });

      expect(userRepository.update).toHaveBeenCalledWith('user-1', { passwordHash: 'new-hash' });
    });
  });
});
