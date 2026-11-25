import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeEmailVerificationTokenRepository,
  makeLoginEventRepository,
  makePasswordHasher,
  makePasswordResetTokenRepository,
} from '#src/__tests__/helpers/mocks/auth.js';
import {
  makeCaptchaVerifier,
  makeLogger,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeOAuthAccountRepository,
  makeOAuthProvider,
  makeOAuthProviderRegistry,
} from '#src/__tests__/helpers/mocks/oauth.js';
import { makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { LoginUseCase } from '#src/use-cases/auth/LoginUseCase.js';
import { LoginWithTotpUseCase } from '#src/use-cases/auth/LoginWithTotpUseCase.js';
import { RegisterUseCase } from '#src/use-cases/auth/RegisterUseCase.js';
import { RequestPasswordResetUseCase } from '#src/use-cases/auth/RequestPasswordResetUseCase.js';
import { RequestBackupEmailRecoveryUseCase } from '#src/use-cases/auth/RequestBackupEmailRecoveryUseCase.js';
import { RequestEmailChangeUseCase } from '#src/use-cases/user/RequestEmailChangeUseCase.js';
import { RequestAddBackupEmailUseCase } from '#src/use-cases/user/RequestAddBackupEmailUseCase.js';
import { SetUserPlanUseCase } from '#src/use-cases/plans/SetUserPlanUseCase.js';
import { LoginOrSignupWithOAuthUseCase } from '#src/use-cases/oauth/LoginOrSignupWithOAuthUseCase.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IBackupEmailVerificationTokenRepository } from '#src/use-cases/ports/IBackupEmailVerificationTokenRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ISendEmailVerificationUseCase } from '#src/use-cases/auth/ISendEmailVerificationUseCase.js';

/**
 * Every use case that takes an account email normalises it first (JEF-692), so the
 * repository, the rate-limit keys and the stored tokens all see `jeff@example.com`
 * whatever the client typed.
 */
const TYPED = '  Jeff@Example.COM ';
const NORMAL = 'jeff@example.com';

const passwordHasher = makePasswordHasher();

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

const makeBackupTokenRepository = (): IBackupEmailVerificationTokenRepository => ({
  create: vi.fn().mockResolvedValue(undefined),
  findByTokenHash: vi.fn().mockResolvedValue(null),
  markUsed: vi.fn().mockResolvedValue(undefined),
  deleteAllForUser: vi.fn().mockResolvedValue(undefined),
});

const consumedKeys = (limiter: IRateLimiter): string[] =>
  vi.mocked(limiter.consume).mock.calls.map(([key]) => key);

describe('email normalisation in the use cases (JEF-692)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('register stores, looks up and rate-limits the normalised email', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeUser({ email: NORMAL })),
    });
    const registerRateLimiter = makeRateLimiter();
    const sendEmailVerificationUseCase: ISendEmailVerificationUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    const output = await new RegisterUseCase({
      passwordHasher: makePasswordHasher({ hash: vi.fn().mockResolvedValue('hashed') }),
      userRepository,
      generateId: vi.fn().mockReturnValue('user-1'),
      sendEmailVerificationUseCase,
      captchaVerifier: makeCaptchaVerifier(),
      registerRateLimiter,
      registerWithoutCaptchaRateLimiter: makeRateLimiter(),
    }).execute({ email: TYPED, password: 'password123', enforceCaptcha: true });

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ email: NORMAL }));
    expect(consumedKeys(registerRateLimiter)).toContain(`register:email:${NORMAL}`);
    expect(output.email).toBe(NORMAL);
  });

  it('login looks up the normalised email and counts attempts against it', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const loginRateLimiter = makeRateLimiter();
    const loginFailureRateLimiter = makeRateLimiter();

    await new LoginUseCase({
      passwordHasher,
      userRepository,
      loginEventRepository: makeLoginEventRepository(),
      generateId: vi.fn(),
      logger: makeLogger(),
      captchaVerifier: makeCaptchaVerifier(),
      loginRateLimiter,
      loginFailureRateLimiter,
    })
      .execute({ email: TYPED, password: 'password123', enforceCaptcha: false })
      .catch(() => undefined);

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
    expect(consumedKeys(loginRateLimiter)).toContain(`login:email:${NORMAL}`);
    expect(consumedKeys(loginFailureRateLimiter)).toContain(`login-failure:email:${NORMAL}`);
  });

  it('TOTP login looks up the normalised email', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });

    await new LoginWithTotpUseCase({
      passwordHasher,
      userRepository,
      totpRateLimiter: makeRateLimiter(),
      logger: makeLogger(),
    } as unknown as ConstructorParameters<typeof LoginWithTotpUseCase>[0])
      .execute({ email: TYPED, password: 'password123', code: '123456', ipAddress: '127.0.0.1' })
      .catch(() => undefined);

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
  });

  it('password reset rate-limits and looks up the normalised email', async () => {
    const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
    const passwordResetRateLimiter = makeRateLimiter();

    await new RequestPasswordResetUseCase({
      userRepository,
      passwordResetTokenRepository: makePasswordResetTokenRepository(),
      emailService: makeEmailService(),
      passwordResetRateLimiter,
      captchaVerifier: makeCaptchaVerifier(),
      generateId: vi.fn(),
      webAppOrigin: 'http://localhost:3000',
    }).execute({ email: TYPED, ipAddress: '127.0.0.1', enforceCaptcha: false });

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
    expect(consumedKeys(passwordResetRateLimiter)).toContain(`password-reset:email:${NORMAL}`);
  });

  it('backup-email recovery rate-limits and looks up the normalised backup email', async () => {
    const userRepository = makeUserRepository({
      findByBackupEmail: vi.fn().mockResolvedValue(null),
    });
    const backupEmailRecoveryRateLimiter = makeRateLimiter();

    await new RequestBackupEmailRecoveryUseCase({
      userRepository,
      passwordResetTokenRepository: makePasswordResetTokenRepository(),
      emailService: makeEmailService(),
      backupEmailRecoveryRateLimiter,
      generateId: vi.fn(),
      webAppOrigin: 'http://localhost:3000',
    }).execute({ backupEmail: TYPED, ipAddress: '127.0.0.1' });

    expect(userRepository.findByBackupEmail).toHaveBeenCalledWith(NORMAL);
    expect(consumedKeys(backupEmailRecoveryRateLimiter)).toContain(
      `backup-email-recovery:email:${NORMAL}`,
    );
  });

  it('email change checks, stores in the token and sends to the normalised address', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
      findByEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    const emailVerificationTokenRepository = makeEmailVerificationTokenRepository();
    const emailService = makeEmailService();

    await new RequestEmailChangeUseCase({
      passwordHasher,
      userRepository,
      emailVerificationTokenRepository,
      emailService,
      requestEmailChangeRateLimiter: makeRateLimiter(),
      generateId: vi.fn().mockReturnValue('token-1'),
      webAppOrigin: 'https://app.example.com',
    }).execute({ userId: 'user-1', currentPassword: 'secret123', newEmail: TYPED });

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
    expect(emailVerificationTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ newEmail: NORMAL }),
    );
    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(NORMAL, expect.any(String));
  });

  it('adding a backup email compares, looks up and stores the normalised address', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', email: 'main@example.com' })),
      findByBackupEmail: vi.fn().mockResolvedValue(null),
    });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
    const backupEmailVerificationTokenRepository = makeBackupTokenRepository();
    const emailService = makeEmailService();

    await new RequestAddBackupEmailUseCase({
      passwordHasher,
      userRepository,
      backupEmailVerificationTokenRepository,
      emailService,
      requestAddBackupEmailRateLimiter: makeRateLimiter(),
      generateId: vi.fn().mockReturnValue('token-1'),
      webAppOrigin: 'https://app.example.com',
    }).execute({ userId: 'user-1', currentPassword: 'secret123', backupEmail: TYPED });

    expect(userRepository.findByBackupEmail).toHaveBeenCalledWith(NORMAL);
    expect(backupEmailVerificationTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ newBackupEmail: NORMAL }),
    );
  });

  it('adding a backup email that equals the account email in another case is refused', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', email: NORMAL })),
    });
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);

    const err = await new RequestAddBackupEmailUseCase({
      passwordHasher,
      userRepository,
      backupEmailVerificationTokenRepository: makeBackupTokenRepository(),
      emailService: makeEmailService(),
      requestAddBackupEmailRateLimiter: makeRateLimiter(),
      generateId: vi.fn(),
      webAppOrigin: 'https://app.example.com',
    })
      .execute({ userId: 'user-1', currentPassword: 'secret123', backupEmail: 'JEFF@example.com' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('the plan CLI finds the user by the normalised email', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', email: NORMAL })),
      update: vi.fn().mockResolvedValue(makeUser()),
    });

    await new SetUserPlanUseCase({ userRepository, now: () => new Date() }).execute({
      email: TYPED,
      plan: 'pro',
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
  });

  it('OAuth sign-up creates the account and the link with the normalised provider email', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeUser({ id: 'user-1', email: NORMAL })),
    });
    const oauthAccountRepository = makeOAuthAccountRepository({
      findByProvider: vi.fn().mockResolvedValue(null),
    });
    const oauthProviderRegistry = makeOAuthProviderRegistry({
      get: vi.fn().mockReturnValue(
        makeOAuthProvider({
          exchangeCodeForProfile: vi.fn().mockResolvedValue({
            providerAccountId: 'sub-1',
            email: 'Jeff@Example.COM',
            emailVerified: true,
            name: 'Jeff',
          }),
        }),
      ),
    });

    await new LoginOrSignupWithOAuthUseCase({
      userRepository,
      oauthAccountRepository,
      oauthProviderRegistry,
      generateId: vi.fn().mockReturnValue('generated-id'),
      sessionRepository: makeSessionRepository(),
      emailVerificationTokenRepository: makeEmailVerificationTokenRepository(),
    }).execute({
      provider: 'google',
      code: 'auth-code',
      redirectUri: 'https://api/cb',
      codeVerifier: 'test-verifier',
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith(NORMAL);
    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({ email: NORMAL }));
    expect(oauthAccountRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: NORMAL }),
    );
  });
});
