import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestPasswordResetUseCase } from '#src/use-cases/auth/RequestPasswordResetUseCase.js';
import { makePasswordResetTokenRepository } from '#src/__tests__/helpers/mocks/auth.js';
import {
  makeCaptchaVerifier,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

const makeEmailService = (overrides?: Partial<IEmailService>): IEmailService => ({
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeDeps = (overrides?: object) => ({
  userRepository: makeUserRepository(),
  passwordResetTokenRepository: makePasswordResetTokenRepository(),
  emailService: makeEmailService(),
  passwordResetRateLimiter: makeRateLimiter(),
  captchaVerifier: makeCaptchaVerifier(),
  generateId: vi.fn().mockReturnValue('generated-id'),
  webAppOrigin: 'http://localhost:3000',
  ...overrides,
});

describe('RequestPasswordResetUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('silently no-ops when the email does not match a user', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const passwordResetTokenRepository = makePasswordResetTokenRepository();
    const emailService = makeEmailService();

    await new RequestPasswordResetUseCase(
      makeDeps({ userRepository, passwordResetTokenRepository, emailService }),
    ).execute({ email: 'nobody@example.com', ipAddress: '127.0.0.1', enforceCaptcha: true });

    expect(passwordResetTokenRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('deletes existing tokens, creates a new one, and emails a reset link', async () => {
    const user = makeUser({ id: 'user-1', email: 'test@example.com' });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const passwordResetTokenRepository = makePasswordResetTokenRepository();
    const emailService = makeEmailService();

    await new RequestPasswordResetUseCase(
      makeDeps({
        userRepository,
        passwordResetTokenRepository,
        emailService,
        webAppOrigin: 'https://app.jobfinder.com',
      }),
    ).execute({ email: 'test@example.com', ipAddress: '127.0.0.1', enforceCaptcha: true });

    expect(passwordResetTokenRepository.deleteAllForUser).toHaveBeenCalledWith('user-1');
    expect(passwordResetTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-id', userId: 'user-1' }),
    );
    expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
      'test@example.com',
      expect.stringMatching(/^https:\/\/app\.jobfinder\.com\/reset-password\?token=[a-f0-9]+$/),
    );
  });

  it('sets an expiry roughly one hour in the future', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const passwordResetTokenRepository = makePasswordResetTokenRepository();

    const before = Date.now();
    await new RequestPasswordResetUseCase(
      makeDeps({ userRepository, passwordResetTokenRepository }),
    ).execute({ email: 'test@example.com', ipAddress: '127.0.0.1', enforceCaptcha: true });
    const after = Date.now();

    const createCall = vi.mocked(passwordResetTokenRepository.create).mock.calls[0][0];
    const expiresAtMs = createCall.expiresAt.getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 1000);
  });

  it('does not let an email-provider failure surface differently than the unknown-email no-op', async () => {
    const user = makeUser({ id: 'user-1', email: 'test@example.com' });
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) });
    const emailService = makeEmailService({
      sendPasswordReset: vi.fn().mockRejectedValue(new Error('Brevo API error 500')),
    });

    await expect(
      new RequestPasswordResetUseCase(makeDeps({ userRepository, emailService })).execute({
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        enforceCaptcha: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('rate-limits by email address regardless of whether the account exists', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const rateLimiter = makeRateLimiter({ consume: vi.fn().mockReturnValue(false) });

    const err = await new RequestPasswordResetUseCase(
      makeDeps({ userRepository, passwordResetRateLimiter: rateLimiter }),
    )
      .execute({ email: 'nobody@example.com', ipAddress: '127.0.0.1', enforceCaptcha: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(rateLimiter.consume).toHaveBeenCalledWith('password-reset:email:nobody@example.com');
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('rate-limits by IP address in addition to email', async () => {
    const rateLimiter = makeRateLimiter({
      consume: vi.fn().mockImplementation((key: string) => !key.startsWith('password-reset:ip:')),
    });

    const err = await new RequestPasswordResetUseCase(
      makeDeps({ passwordResetRateLimiter: rateLimiter }),
    )
      .execute({ email: 'test@example.com', ipAddress: '203.0.113.5', enforceCaptcha: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('RATE_LIMITED');
    expect(rateLimiter.consume).toHaveBeenCalledWith('password-reset:ip:203.0.113.5');
  });

  it('lowercases the email when building the rate-limit key', async () => {
    const rateLimiter = makeRateLimiter();
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });

    await new RequestPasswordResetUseCase(
      makeDeps({ userRepository, passwordResetRateLimiter: rateLimiter }),
    ).execute({
      email: 'Test@Example.com',
      ipAddress: null,
      enforceCaptcha: true,
    });

    expect(rateLimiter.consume).toHaveBeenCalledWith('password-reset:email:test@example.com');
  });
  describe('captcha (JEF-401)', () => {
    const input = { email: 'test@example.com', ipAddress: '203.0.113.5', enforceCaptcha: true };
    const code = (err: unknown) => (err as { code: string }).code;

    it('verifies the token with the caller ip', async () => {
      const captchaVerifier = makeCaptchaVerifier();

      await new RequestPasswordResetUseCase(makeDeps({ captchaVerifier })).execute({
        ...input,
        captchaToken: 'tok',
      });

      expect(captchaVerifier.verify).toHaveBeenCalledWith('tok', '203.0.113.5');
    });

    it('refuses a request with no token as CAPTCHA_REQUIRED, before spending any rate limit', async () => {
      const passwordResetRateLimiter = makeRateLimiter();
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });

      const err = await new RequestPasswordResetUseCase(
        makeDeps({ captchaVerifier, passwordResetRateLimiter }),
      )
        .execute(input)
        .catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_REQUIRED');
      expect(passwordResetRateLimiter.consume).not.toHaveBeenCalled();
    });

    it('refuses a token the verifier rejects as CAPTCHA_FAILED', async () => {
      const userRepository = makeUserRepository();
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });

      const err = await new RequestPasswordResetUseCase(
        makeDeps({ captchaVerifier, userRepository }),
      )
        .execute({ ...input, captchaToken: 'bad' })
        .catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_FAILED');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('skips the check for a client that cannot show a captcha', async () => {
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });

      await new RequestPasswordResetUseCase(makeDeps({ captchaVerifier })).execute({
        ...input,
        enforceCaptcha: false,
      });

      expect(captchaVerifier.verify).not.toHaveBeenCalled();
    });
  });
});
