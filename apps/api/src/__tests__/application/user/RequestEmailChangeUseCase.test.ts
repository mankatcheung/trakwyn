import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { RequestEmailChangeUseCase } from '#src/use-cases/user/RequestEmailChangeUseCase.js';
import { makeEmailVerificationTokenRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

const makeEmailService = (overrides?: Partial<IEmailService>): IEmailService => ({
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  sendStepUpCode: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionConfirmation: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionScheduled: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionCancelled: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('RequestEmailChangeUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    userId: 'user-1',
    currentPassword: 'secret123',
    newEmail: 'new@example.com',
  };

  it('throws NOT_FOUND when user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn(),
      webAppOrigin: 'https://app.example.com',
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws UNAUTHORIZED when password is wrong', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const err = await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn(),
      webAppOrigin: 'https://app.example.com',
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('throws CONFLICT when new email is already taken by another user', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
      findByEmail: vi.fn().mockResolvedValue(makeUser({ id: 'user-2', email: input.newEmail })),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const err = await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn(),
      webAppOrigin: 'https://app.example.com',
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('CONFLICT');
  });

  it('does not change the user email — only sends a confirmation link', async () => {
    const user = makeUser({ id: 'user-1', email: 'old@example.com' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn().mockReturnValue('token-1'),
      webAppOrigin: 'https://app.example.com',
    }).execute(input);

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('clears prior pending tokens and creates a new one carrying the new email', async () => {
    const user = makeUser({ id: 'user-1', email: 'old@example.com' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();

    await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository,
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn().mockReturnValue('token-1'),
      webAppOrigin: 'https://app.example.com',
    }).execute(input);

    expect(emailVerificationTokenRepository.deleteAllForUser).toHaveBeenCalledWith('user-1');
    expect(emailVerificationTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'token-1',
        userId: 'user-1',
        newEmail: 'new@example.com',
      }),
    );
  });

  it('sends the confirmation link to the new address, not the old one', async () => {
    const user = makeUser({ id: 'user-1', email: 'old@example.com' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const emailService = makeEmailService();

    await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService,
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn().mockReturnValue('token-1'),
      webAppOrigin: 'https://app.example.com',
    }).execute(input);

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      'new@example.com',
      expect.stringMatching(/^https:\/\/app\.example\.com\/confirm-email-change\?token=[a-f0-9]+$/),
    );
  });

  it('propagates the error when the confirmation email fails to send', async () => {
    const user = makeUser({ id: 'user-1', email: 'old@example.com' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const emailService = makeEmailService({
      sendEmailVerification: vi.fn().mockRejectedValue(new Error('Brevo is down')),
      sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      new RequestEmailChangeUseCase({
        userRepository,
        emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
        emailService,
        requestEmailChangeRateLimiter: makeRateLimiter(),
        generateId: vi.fn().mockReturnValue('token-1'),
        webAppOrigin: 'https://app.example.com',
      }).execute(input),
    ).rejects.toThrow('Brevo is down');
  });

  it('throws RATE_LIMITED when too many attempts have been made', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
    });
    const requestEmailChangeRateLimiter = makeRateLimiter({
      consume: vi.fn().mockReturnValue(false),
    });

    const err = await new RequestEmailChangeUseCase({
      userRepository,
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
      emailService: makeEmailService(),
      requestEmailChangeRateLimiter,
      generateId: vi.fn(),
      webAppOrigin: 'https://app.example.com',
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(requestEmailChangeRateLimiter.consume).toHaveBeenCalledWith(
      'request-email-change:user:user-1',
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  describe('step-up freshness (JEF-44)', () => {
    it('throws STEP_UP_REQUIRED for a 2FA-enabled user with a stale session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const err = await new RequestEmailChangeUseCase({
        userRepository,
        emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
        emailService: makeEmailService(),
        requestEmailChangeRateLimiter: makeRateLimiter(),
        generateId: vi.fn(),
        webAppOrigin: 'https://app.example.com',
      })
        .execute({ ...input, authTime: Date.now() - 16 * 60 * 1000 })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('STEP_UP_REQUIRED');
    });

    it('succeeds for a 2FA-enabled user with a fresh session', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true, email: 'old@example.com' });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(user),
        findByEmail: vi.fn().mockResolvedValue(null),
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      const emailService = makeEmailService();

      await new RequestEmailChangeUseCase({
        userRepository,
        emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
        emailService,
        requestEmailChangeRateLimiter: makeRateLimiter(),
        generateId: vi.fn().mockReturnValue('token-1'),
        webAppOrigin: 'https://app.example.com',
      }).execute({ ...input, authTime: Date.now() });

      expect(emailService.sendEmailVerification).toHaveBeenCalled();
    });
  });
});
