import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmEmailChangeUseCase } from '#src/use-cases/user/ConfirmEmailChangeUseCase.js';
import {
  makeEmailVerificationToken,
  makeEmailVerificationTokenRepository,
  makeSecurityEventRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const RAW_TOKEN = 'raw-confirm-token';
const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

const makeDeps = (overrides?: object) => ({
  userRepository: makeUserRepository(),
  emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
  securityEventRepository: makeSecurityEventRepository(),
  generateId: () => 'evt-1',
  ...overrides,
});

describe('ConfirmEmailChangeUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UNAUTHORIZED when no token matches the hash', async () => {
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(null),
    });

    const err = await new ConfirmEmailChangeUseCase(makeDeps({ emailVerificationTokenRepository }))
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED when the token has no newEmail (a registration-verification token, not a change token)', async () => {
    const token = makeEmailVerificationToken({ tokenHash: TOKEN_HASH, newEmail: null });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });

    const err = await new ConfirmEmailChangeUseCase(makeDeps({ emailVerificationTokenRepository }))
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED when the token was already used', async () => {
    const token = makeEmailVerificationToken({
      tokenHash: TOKEN_HASH,
      newEmail: 'new@example.com',
      usedAt: new Date('2024-01-01T00:30:00.000Z'),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });

    const err = await new ConfirmEmailChangeUseCase(makeDeps({ emailVerificationTokenRepository }))
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED when the token has expired', async () => {
    const token = makeEmailVerificationToken({
      tokenHash: TOKEN_HASH,
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });

    const err = await new ConfirmEmailChangeUseCase(makeDeps({ emailVerificationTokenRepository }))
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws CONFLICT when the new email was taken by someone else while the link was unused', async () => {
    const token = makeEmailVerificationToken({
      tokenHash: TOKEN_HASH,
      userId: 'user-1',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUser({ id: 'user-2', email: 'new@example.com' })),
    });

    const err = await new ConfirmEmailChangeUseCase(
      makeDeps({ userRepository, emailVerificationTokenRepository }),
    )
      .execute({ token: RAW_TOKEN })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('CONFLICT');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('applies the new email, marks it verified, and marks the token used for a valid token', async () => {
    const token = makeEmailVerificationToken({
      id: 'token-1',
      tokenHash: TOKEN_HASH,
      userId: 'user-1',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
    });

    await new ConfirmEmailChangeUseCase(
      makeDeps({ userRepository, emailVerificationTokenRepository }),
    ).execute({ token: RAW_TOKEN });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      email: 'new@example.com',
      emailVerifiedAt: expect.any(Date) as Date,
    });
    expect(emailVerificationTokenRepository.markUsed).toHaveBeenCalledWith('token-1');
  });

  it('records an email_changed security event with the caller device info', async () => {
    const token = makeEmailVerificationToken({
      id: 'token-1',
      tokenHash: TOKEN_HASH,
      userId: 'user-1',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const securityEventRepository = makeSecurityEventRepository();

    await new ConfirmEmailChangeUseCase(
      makeDeps({ userRepository, emailVerificationTokenRepository, securityEventRepository }),
    ).execute({ token: RAW_TOKEN, ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0' });

    expect(securityEventRepository.create).toHaveBeenCalledWith({
      id: 'evt-1',
      userId: 'user-1',
      eventType: 'email_changed',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('allows re-confirming the same email the token owner already has (no false CONFLICT)', async () => {
    const token = makeEmailVerificationToken({
      id: 'token-1',
      tokenHash: TOKEN_HASH,
      userId: 'user-1',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository({
      findByTokenHash: vi.fn().mockResolvedValue(token),
    });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', email: 'new@example.com' })),
    });

    await expect(
      new ConfirmEmailChangeUseCase(
        makeDeps({ userRepository, emailVerificationTokenRepository }),
      ).execute({ token: RAW_TOKEN }),
    ).resolves.toBeUndefined();
    expect(userRepository.update).toHaveBeenCalled();
  });
});
