import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyEmailUseCase } from '#src/use-cases/auth/VerifyEmailUseCase.js';
import {
  makeEmailVerificationToken,
  makeEmailVerificationTokenRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const RAW_TOKEN = 'raw-verify-token';
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

describe('VerifyEmailUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UNAUTHORIZED when no token matches the hash', async () => {
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(null),
    });
    const userRepository = makeUserRepository();

    const err = await new VerifyEmailUseCase({
      userRepository,
      emailVerificationTokenRepository,
    })
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when the token was already used', async () => {
    const verificationToken = makeEmailVerificationToken({
      tokenHash: TOKEN_HASH,
      usedAt: new Date('2024-01-01T00:30:00.000Z'),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(verificationToken),
    });
    const userRepository = makeUserRepository();

    const err = await new VerifyEmailUseCase({
      userRepository,
      emailVerificationTokenRepository,
    })
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when the token has expired', async () => {
    const verificationToken = makeEmailVerificationToken({
      tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() - 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(verificationToken),
    });
    const userRepository = makeUserRepository();

    const err = await new VerifyEmailUseCase({
      userRepository,
      emailVerificationTokenRepository,
    })
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('marks the user verified and the token used for a valid token', async () => {
    const verificationToken = makeEmailVerificationToken({
      id: 'verify-1',
      userId: 'user-1',
      tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(verificationToken),
    });
    const userRepository = makeUserRepository();

    await new VerifyEmailUseCase({ userRepository, emailVerificationTokenRepository }).execute({
      token: RAW_TOKEN,
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
    );
    expect(emailVerificationTokenRepository.markUsed).toHaveBeenCalledWith('verify-1');
  });
});
