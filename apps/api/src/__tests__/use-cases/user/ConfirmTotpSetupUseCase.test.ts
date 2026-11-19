import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { ConfirmTotpSetupUseCase } from '#src/use-cases/user/ConfirmTotpSetupUseCase.js';
import {
  makeSecurityEventRepository,
  makeTotpBackupCodeRepository,
  makeTotpProvider,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

// Test-only fixture helper: production code only ever verifies codes (a real
// authenticator app generates them), so "generate a currently-valid code" has
// no place on ITotpProvider — it's needed here purely to build test fixtures.
const fixtureCrypto = new NobleCryptoPlugin();
const fixtureBase32 = new ScureBase32Plugin();
function generateValidCode(secret: string): Promise<string> {
  return new TOTP({ crypto: fixtureCrypto, base32: fixtureBase32, secret }).generate();
}

describe('ConfirmTotpSetupUseCase', () => {
  const generateId = vi.fn(() => 'backup-code-id');
  const totpProvider = makeTotpProvider();
  const securityEventRepository = makeSecurityEventRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    generateId.mockReturnValue('backup-code-id');
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const err = await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    })
      .execute({ userId: 'missing', code: '123456' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws CONFLICT when 2FA is already enabled', async () => {
    const user = makeUser({ totpEnabled: true, totpSecret: 'encrypted:ABCD1234' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const err = await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    })
      .execute({ userId: 'user-1', code: '123456' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('CONFLICT');
  });

  it('throws CONFLICT when no setup is in progress', async () => {
    const user = makeUser({ totpEnabled: false, totpSecret: null });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const err = await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    })
      .execute({ userId: 'user-1', code: '123456' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('CONFLICT');
  });

  it('throws UNAUTHORIZED for an invalid code', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({
      totpEnabled: false,
      totpSecret: `encrypted:${secret}`,
    });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const err = await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    })
      .execute({ userId: 'user-1', code: '000000' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(totpBackupCodeRepository.create).not.toHaveBeenCalled();
  });

  it('enables 2FA and issues backup codes when given a valid code', async () => {
    const secret = totpProvider.generateSecret();
    const validCode = await generateValidCode(secret);
    const user = makeUser({ id: 'user-1', totpEnabled: false, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    const result = await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    }).execute({
      userId: 'user-1',
      code: validCode,
    });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', { totpEnabled: true });
    expect(result.backupCodes).toHaveLength(10);
    expect(new Set(result.backupCodes).size).toBe(10); // all unique
    result.backupCodes.forEach((code) => expect(code).toMatch(/^[0-9a-f]{16}$/));
    expect(totpBackupCodeRepository.create).toHaveBeenCalledTimes(10);
    expect(totpBackupCodeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', id: 'backup-code-id' }),
    );
  });

  it('records a totp_enabled security event with the caller device info', async () => {
    const secret = totpProvider.generateSecret();
    const validCode = await generateValidCode(secret);
    const user = makeUser({ id: 'user-1', totpEnabled: false, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();

    await new ConfirmTotpSetupUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpProvider,
      generateId,
      securityEventRepository,
    }).execute({
      userId: 'user-1',
      code: validCode,
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'backup-code-id',
      userId: 'user-1',
      eventType: 'totp_enabled',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });
});
