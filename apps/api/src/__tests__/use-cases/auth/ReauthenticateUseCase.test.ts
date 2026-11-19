import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { createHash } from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { ReauthenticateUseCase } from '#src/use-cases/auth/ReauthenticateUseCase.js';
import {
  makeTotpBackupCode,
  makeTotpBackupCodeRepository,
  makeTotpProvider,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const passwordHasher = makePasswordHasher();

// Test-only fixture helper — see LoginWithTotpUseCase.test.ts for rationale.
const fixtureCrypto = new NobleCryptoPlugin();
const fixtureBase32 = new ScureBase32Plugin();
function generateValidCode(secret: string): Promise<string> {
  return new TOTP({ crypto: fixtureCrypto, base32: fixtureBase32, secret }).generate();
}

describe('ReauthenticateUseCase', () => {
  const totpProvider = makeTotpProvider();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = { userId: 'user-1', password: 'password123' };

  it('throws UNAUTHORIZED when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED when the password is wrong', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(false as never);

    const err = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('returns totpRequired: false for a valid password when 2FA is not enabled', async () => {
    const user = makeUser({ id: 'user-1', totpEnabled: false });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    const result = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    }).execute(input);

    expect(result).toEqual({ user, totpRequired: false });
  });

  it('returns totpRequired: true when 2FA is enabled and no code was given', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    const totpRateLimiter = makeRateLimiter();

    const result = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter,
      totpProvider,
    }).execute(input);

    expect(result).toEqual({ user, totpRequired: true });
    expect(totpRateLimiter.consume).not.toHaveBeenCalled();
  });

  it('returns totpRequired: false for a valid code once 2FA is enabled', async () => {
    const secret = totpProvider.generateSecret();
    const validCode = await generateValidCode(secret);
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    const result = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    }).execute({ ...input, code: validCode });

    expect(result).toEqual({ user, totpRequired: false });
  });

  it('accepts a valid, unused backup code as a fallback and marks it used', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const rawBackupCode = 'a1b2c3d4e5f60718';
    const codeHash = createHash('sha256').update(rawBackupCode).digest('hex');
    const backupCode = makeTotpBackupCode({ id: 'backup-1', userId: 'user-1', codeHash });
    const totpBackupCodeRepository = makeTotpBackupCodeRepository({
      findByCodeHash: vi.fn().mockResolvedValue(backupCode),
    });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    const result = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository,
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    }).execute({ ...input, code: rawBackupCode });

    expect(result).toEqual({ user, totpRequired: false });
    expect(totpBackupCodeRepository.markUsed).toHaveBeenCalledWith('backup-1');
  });

  it('throws UNAUTHORIZED for an invalid code with no matching backup code', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    const err = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter: makeRateLimiter(),
      totpProvider,
    })
      .execute({ ...input, code: '000000' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws RATE_LIMITED when too many verification attempts have been made', async () => {
    const secret = totpProvider.generateSecret();
    const user = makeUser({ id: 'user-1', totpEnabled: true, totpSecret: `encrypted:${secret}` });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    const totpRateLimiter = makeRateLimiter({ consume: vi.fn().mockReturnValue(false) });

    const err = await new ReauthenticateUseCase({
      passwordHasher,
      userRepository,
      totpBackupCodeRepository: makeTotpBackupCodeRepository(),
      totpRateLimiter,
      totpProvider,
    })
      .execute({ ...input, code: '123456' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
  });
});
