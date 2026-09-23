import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import bcrypt from 'bcryptjs';
import { LoginWithTotpUseCase } from '#src/use-cases/auth/LoginWithTotpUseCase.js';
import {
  makeTotpBackupCode,
  makeTotpBackupCodeRepository,
  makeTotpProvider,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeLogger, makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

// Test-only fixture helper: production code only ever verifies codes (a real
// authenticator app generates them), so "generate a currently-valid code" has
// no place on ITotpProvider — it's needed here purely to build test fixtures.
const fixtureCrypto = new NobleCryptoPlugin();
const fixtureBase32 = new ScureBase32Plugin();
function generateValidCode(secret: string): Promise<string> {
  return new TOTP({ crypto: fixtureCrypto, base32: fixtureBase32, secret }).generate();
}

describe('LoginWithTotpUseCase', () => {
  const totpProvider = makeTotpProvider();
  const logger = makeLogger();

  /** The single `auth.totp.failed` line, or undefined if none was written. */
  const failureLog = () =>
    vi.mocked(logger.warn).mock.calls.find(([, , fields]) => fields?.event === 'auth.totp.failed');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    email: 'test@example.com',
    password: 'password123',
    code: '123456',
    ipAddress: '127.0.0.1',
  };

  it('throws UNAUTHORIZED when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter();

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(failureLog()?.[2]).toEqual({
      event: 'auth.totp.failed',
      reason: 'invalid_credentials',
      userId: undefined,
    });
  });

  it('throws UNAUTHORIZED when the password is wrong', async () => {
    const user = makeUser({ totpEnabled: true, totpSecret: 'encrypted:ABCD1234' });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    // Same reason and no user id as an unknown email, so the log cannot tell
    // the two apart either.
    expect(failureLog()?.[2]).toEqual({
      event: 'auth.totp.failed',
      reason: 'invalid_credentials',
      userId: undefined,
    });
  });

  it('throws UNAUTHORIZED when 2FA is not enabled for the user', async () => {
    const user = makeUser({ totpEnabled: false, totpSecret: null });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws RATE_LIMITED when too many verification attempts have been made', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter({ consume: vi.fn().mockReturnValue(false) });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
  });

  it('throws UNAUTHORIZED for an invalid code with no matching backup code', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute({ ...input, code: '000000' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(failureLog()?.[2]).toEqual({
      event: 'auth.totp.failed',
      reason: 'invalid_code',
      userId: user.id,
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(input.email);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(input.ipAddress);
  });

  it('returns the user for valid credentials and a valid code', async () => {
    const secret = totpProvider.generateSecret();
    const validCode = await generateValidCode(secret);
    const user = makeUser({ totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository();
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    }).execute({
      ...input,
      code: validCode,
    });

    expect(result).toEqual(user);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('accepts a valid, unused backup code as a fallback and marks it used', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const rawBackupCode = 'a1b2c3d4e5f60718';
    const codeHash = createHash('sha256').update(rawBackupCode).digest('hex');
    const backupCode = makeTotpBackupCode({ id: 'backup-1', userId: 'user-1', codeHash });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository({
      findByCodeHash: vi.fn().mockResolvedValue(backupCode),
    });
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    }).execute({ ...input, code: rawBackupCode });

    expect(result).toEqual(user);
    expect(totpBackupCodeRepository.markUsed).toHaveBeenCalledWith('backup-1');
  });

  it('rejects an already-used backup code', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const rawBackupCode = 'a1b2c3d4e5f60718';
    const codeHash = createHash('sha256').update(rawBackupCode).digest('hex');
    const backupCode = makeTotpBackupCode({
      id: 'backup-1',
      userId: 'user-1',
      codeHash,
      usedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository({
      findByCodeHash: vi.fn().mockResolvedValue(backupCode),
    });
    const totpRateLimiter = makeRateLimiter();
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const err = await new LoginWithTotpUseCase({
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter,
      totpProvider,
      logger,
    })
      .execute({ ...input, code: rawBackupCode })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(totpBackupCodeRepository.markUsed).not.toHaveBeenCalled();
  });
});
