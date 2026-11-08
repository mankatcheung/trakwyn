import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { DisableTotpUseCase } from '#src/use-cases/user/DisableTotpUseCase.js';
import {
  makeSecurityEventRepository,
  makeTotpBackupCodeRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const passwordHasher = makePasswordHasher();

function securityDeps() {
  return { securityEventRepository: makeSecurityEventRepository(), generateId: () => 'evt-1' };
}

describe('DisableTotpUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = { userId: 'user-1', password: 'secret123' };

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const err = await new DisableTotpUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository,
      ...securityDeps(),
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws UNAUTHORIZED when the password is wrong', async () => {
    const user = makeUser({ totpEnabled: true, totpSecret: 'ABCD1234' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    vi.mocked(passwordHasher.compare).mockResolvedValue(false as never);

    const err = await new DisableTotpUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository,
      ...securityDeps(),
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(totpBackupCodeRepository.deleteAllForUser).not.toHaveBeenCalled();
  });

  it('clears totpSecret, disables totpEnabled, and deletes backup codes on correct password', async () => {
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: 'ABCD1234' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    await new DisableTotpUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository,
      ...securityDeps(),
    }).execute(input);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      totpEnabled: false,
      totpSecret: null,
    });
    expect(totpBackupCodeRepository.deleteAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('records a totp_disabled security event with the caller device info', async () => {
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: 'ABCD1234' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const securityEventRepository = makeSecurityEventRepository();
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    await new DisableTotpUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository,
      securityEventRepository,
      generateId: () => 'evt-1',
    }).execute({ ...input, ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0' });

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'evt-1',
      userId: 'user-1',
      eventType: 'totp_disabled',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });
});
