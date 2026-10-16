import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendEmailVerificationUseCase } from '#src/use-cases/auth/SendEmailVerificationUseCase.js';
import { makeEmailVerificationTokenRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

const makeEmailService = (overrides?: Partial<IEmailService>): IEmailService => ({
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeDeps = (overrides?: object) => ({
  userRepository: makeUserRepository(),
  emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
  emailService: makeEmailService(),
  emailVerificationUserRateLimiter: makeRateLimiter(),
  emailVerificationGlobalRateLimiter: makeRateLimiter(),
  generateId: vi.fn().mockReturnValue('generated-id'),
  webAppOrigin: 'http://localhost:3000',
  ...overrides,
});

describe('SendEmailVerificationUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new SendEmailVerificationUseCase(makeDeps({ userRepository }))
      .execute('missing')
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('deletes existing tokens, creates a new one, and emails a verification link', async () => {
    const user = makeUser({ id: 'user-1', email: 'test@example.com' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();
    const emailService = makeEmailService();

    await new SendEmailVerificationUseCase(
      makeDeps({
        userRepository,
        emailVerificationTokenRepository,
        emailService,
        webAppOrigin: 'https://app.jobfinder.com',
      }),
    ).execute('user-1');

    expect(emailVerificationTokenRepository.deleteAllForUser).toHaveBeenCalledWith('user-1');
    expect(emailVerificationTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-id', userId: 'user-1' }),
    );
    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringMatching(/^https:\/\/app\.jobfinder\.com\/verify-email\?token=[a-f0-9]+$/),
    );
  });

  it('sets an expiry roughly 24 hours in the future', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();

    const before = Date.now();
    await new SendEmailVerificationUseCase(
      makeDeps({ userRepository, emailVerificationTokenRepository }),
    ).execute('user-1');
    const after = Date.now();

    const createCall = vi.mocked(emailVerificationTokenRepository.create).mock.calls[0][0];
    const expiresAtMs = createCall.expiresAt.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + dayMs - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + dayMs + 1000);
  });

  describe('rate limits (JEF-400)', () => {
    const throttled = () => makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) });

    it.each([
      ['per-user', 'emailVerificationUserRateLimiter'],
      ['global', 'emailVerificationGlobalRateLimiter'],
    ])('rejects with RATE_LIMITED when the %s limit is spent, sending nothing', async (_n, dep) => {
      const user = makeUser({ id: 'user-1' });
      const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
      const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();
      const emailService = makeEmailService();

      const err = await new SendEmailVerificationUseCase(
        makeDeps({
          userRepository,
          emailVerificationTokenRepository,
          emailService,
          [dep]: throttled(),
        }),
      )
        .execute('user-1')
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('RATE_LIMITED');
      // The link already in the user's inbox must keep working.
      expect(emailVerificationTokenRepository.deleteAllForUser).not.toHaveBeenCalled();
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('keys the per-user limit by user id and does not spend the global budget when it trips', async () => {
      const user = makeUser({ id: 'user-1' });
      const userLimiter = throttled();
      const globalLimiter = makeRateLimiter();

      await new SendEmailVerificationUseCase(
        makeDeps({
          userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(user) }),
          emailVerificationUserRateLimiter: userLimiter,
          emailVerificationGlobalRateLimiter: globalLimiter,
        }),
      )
        .execute('user-1')
        .catch(() => undefined);

      expect(userLimiter.consume).toHaveBeenCalledWith('email-verification:user:user-1');
      expect(globalLimiter.consume).not.toHaveBeenCalled();
    });
  });
});
