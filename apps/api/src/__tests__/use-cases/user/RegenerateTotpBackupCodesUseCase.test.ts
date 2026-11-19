import { describe, expect, it, vi } from 'vitest';
import { RegenerateTotpBackupCodesUseCase } from '#src/use-cases/user/RegenerateTotpBackupCodesUseCase.js';
import {
  makePasswordHasher,
  makeSecurityEventRepository,
  makeTotpBackupCodeRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

describe('RegenerateTotpBackupCodesUseCase', () => {
  it('requires an enabled TOTP account', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ totpEnabled: false })),
    });
    const useCase = new RegenerateTotpBackupCodesUseCase({
      passwordHasher: makePasswordHasher(),
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      securityEventRepository: makeSecurityEventRepository(),
      generateId: () => 'id',
    });

    const err = await useCase
      .execute({ userId: 'user-1', currentPassword: 'password', authTime: null })
      .catch((error) => error);

    expect((err as { code: string }).code).toBe('CONFLICT');
  });

  it('rejects a wrong current password', async () => {
    const passwordHasher = makePasswordHasher({ compare: vi.fn().mockResolvedValue(false) });
    const useCase = new RegenerateTotpBackupCodesUseCase({
      passwordHasher,
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ totpEnabled: true })),
      }),
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      securityEventRepository: makeSecurityEventRepository(),
      generateId: () => 'id',
    });

    const err = await useCase
      .execute({ userId: 'user-1', currentPassword: 'wrong', authTime: Date.now() })
      .catch((error) => error);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('replaces old codes and returns ten raw codes', async () => {
    const passwordHasher = makePasswordHasher();
    const user = makeUser({ totpEnabled: true, passwordHash: 'stored-hash' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const backupCodeRepository = makeTotpBackupCodeRepository();
    const securityEventRepository = makeSecurityEventRepository();
    const useCase = new RegenerateTotpBackupCodesUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: backupCodeRepository,
      securityEventRepository,
      generateId: vi.fn().mockReturnValue('id'),
    });

    const result = await useCase.execute({
      userId: 'user-1',
      currentPassword: 'password',
      authTime: Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });

    expect(passwordHasher.compare).toHaveBeenCalledWith('password', 'stored-hash');
    expect(result.backupCodes).toHaveLength(10);
    expect(result.backupCodes.every((code) => /^[0-9a-f]{16}$/.test(code))).toBe(true);
    expect(backupCodeRepository.deleteAllForUser).toHaveBeenCalledWith('user-1');
    expect(backupCodeRepository.create).toHaveBeenCalledTimes(10);
    expect(securityEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'totp_backup_codes_regenerated' }),
    );
  });
});
