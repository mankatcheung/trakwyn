import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import { RegisterUseCase } from '#src/use-cases/auth/RegisterUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeCaptchaVerifier,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ISendEmailVerificationUseCase } from '#src/use-cases/auth/ISendEmailVerificationUseCase.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pw'),
    compare: vi.fn(),
  },
}));

const makeSendEmailVerificationUseCase = (
  overrides?: Partial<ISendEmailVerificationUseCase>,
): ISendEmailVerificationUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeCaptchaDeps = () => ({
  captchaVerifier: makeCaptchaVerifier(),
  registerRateLimiter: makeRateLimiter(),
  registerWithoutCaptchaRateLimiter: makeRateLimiter(),
});

describe('RegisterUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('auto-verify (JEF-438)', () => {
    const register = async (autoVerifyEmail: boolean) => {
      const userRepository = makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(makeUser()),
      });
      const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();
      await new RegisterUseCase({
        ...makeCaptchaDeps(),
        userRepository,
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase,
        autoVerifyEmail,
      }).execute({ email: 'test@example.com', password: 'password123', enforceCaptcha: true });
      return { userRepository, sendEmailVerificationUseCase };
    };

    it('creates the account verified and sends no email when auto-verify is on', async () => {
      const { userRepository, sendEmailVerificationUseCase } = await register(true);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      );
      expect(sendEmailVerificationUseCase.execute).not.toHaveBeenCalled();
    });

    it('leaves the account unverified and sends the email when auto-verify is off', async () => {
      const { userRepository, sendEmailVerificationUseCase } = await register(false);

      const created = vi.mocked(userRepository.create).mock.calls[0]![0];
      expect(created.emailVerifiedAt).toBeUndefined();
      expect(sendEmailVerificationUseCase.execute).toHaveBeenCalledWith('user-1');
    });
  });

  it('registers a new user and returns userId and email', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const generateId = vi.fn().mockReturnValue('user-1');

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId,
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      enforceCaptcha: true,
    });

    expect(result).toEqual({ userId: 'user-1', email: 'test@example.com' });
    expect(userRepository.create).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash: 'hashed-pw',
    });
  });

  it('uses generateId for the new user id', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeUser({ id: 'custom-id' })),
    });
    const generateId = vi.fn().mockReturnValue('custom-id');

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId,
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      enforceCaptcha: true,
    });

    expect(generateId).toHaveBeenCalledOnce();
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'custom-id' }),
    );
  });

  it('throws CONFLICT when email is already registered', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(makeUser()),
    });

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId: vi.fn(),
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'password123', enforceCaptcha: true })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('CONFLICT');
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when the password is too short', async () => {
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
    });

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId: vi.fn(),
      sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      registerRateLimiter: makeRateLimiter(),
    });
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'short', enforceCaptcha: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
  });

  it('sends an email verification for the new user', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId: vi.fn().mockReturnValue('user-1'),
      sendEmailVerificationUseCase,
      registerRateLimiter: makeRateLimiter(),
    });
    await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      enforceCaptcha: true,
    });

    expect(sendEmailVerificationUseCase.execute).toHaveBeenCalledWith('user-1');
  });

  it('still returns successfully when sending the verification email fails', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(user),
    });
    const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase({
      execute: vi.fn().mockRejectedValue(new Error('Brevo is down')),
    });

    const useCase = new RegisterUseCase({
      ...makeCaptchaDeps(),
      userRepository,
      generateId: vi.fn().mockReturnValue('user-1'),
      sendEmailVerificationUseCase,
      registerRateLimiter: makeRateLimiter(),
    });
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      enforceCaptcha: true,
    });

    expect(result).toEqual({ userId: 'user-1', email: 'test@example.com' });
  });

  describe('abuse controls (JEF-401)', () => {
    const input = {
      email: 'New@Example.com',
      password: 'password123',
      ipAddress: '203.0.113.7',
      enforceCaptcha: true,
    };
    const code = (err: unknown) => (err as { code: string }).code;
    const makeUseCase = (captcha: ReturnType<typeof makeCaptchaDeps>) =>
      new RegisterUseCase({
        ...captcha,
        userRepository: makeUserRepository({
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(makeUser({ id: 'user-1' })),
        }),
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
      });

    it('verifies the captcha token with the caller ip', async () => {
      const captcha = makeCaptchaDeps();

      await makeUseCase(captcha).execute({ ...input, captchaToken: 'tok' });

      expect(captcha.captchaVerifier.verify).toHaveBeenCalledWith('tok', '203.0.113.7');
    });

    it('creates nothing without a token', async () => {
      const captcha = makeCaptchaDeps();
      captcha.captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });
      const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();
      const userRepository = makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) });
      const useCase = new RegisterUseCase({
        ...captcha,
        userRepository,
        generateId: vi.fn(),
        sendEmailVerificationUseCase,
      });

      const err = await useCase.execute(input).catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_REQUIRED');
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(sendEmailVerificationUseCase.execute).not.toHaveBeenCalled();
    });

    it('rejects a token the verifier refuses', async () => {
      const captcha = makeCaptchaDeps();
      captcha.captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });

      const err = await makeUseCase(captcha)
        .execute({ ...input, captchaToken: 'bad' })
        .catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_FAILED');
    });

    it('rate limits by email and by ip with the standard budget', async () => {
      const captcha = makeCaptchaDeps();

      await makeUseCase(captcha).execute({ ...input, captchaToken: 'tok' });

      expect(captcha.registerRateLimiter.consume).toHaveBeenCalledWith(
        'register:email:new@example.com',
      );
      expect(captcha.registerRateLimiter.consume).toHaveBeenCalledWith('register:ip:203.0.113.7');
      expect(captcha.registerWithoutCaptchaRateLimiter.consume).not.toHaveBeenCalled();
    });

    it.each([
      ['email', 'register:email:'],
      ['ip', 'register:ip:'],
    ])('refuses once the %s budget is spent', async (_subject, prefix) => {
      const captcha = makeCaptchaDeps();
      captcha.registerRateLimiter = makeRateLimiter({
        consume: vi.fn(async (key: string) => !key.startsWith(prefix)),
      });

      const err = await makeUseCase(captcha)
        .execute({ ...input, captchaToken: 'tok' })
        .catch((e) => e);

      expect(code(err)).toBe('RATE_LIMITED');
    });

    it('holds a client that cannot show a captcha to the tighter budget, without a check', async () => {
      const captcha = makeCaptchaDeps();

      await makeUseCase(captcha).execute({ ...input, enforceCaptcha: false });

      expect(captcha.captchaVerifier.verify).not.toHaveBeenCalled();
      expect(captcha.registerRateLimiter.consume).not.toHaveBeenCalled();
      // A prefix of its own: the Redis limiter keys on the string alone.
      expect(captcha.registerWithoutCaptchaRateLimiter.consume).toHaveBeenCalledWith(
        'register-without-captcha:ip:203.0.113.7',
      );
      expect(captcha.registerWithoutCaptchaRateLimiter.consume).toHaveBeenCalledWith(
        'register-without-captcha:email:new@example.com',
      );
    });
  });

  describe('sign-up rate limit (JEF-400)', () => {
    it('rejects with RATE_LIMITED before touching the database or sending mail', async () => {
      const userRepository = makeUserRepository();
      const sendEmailVerificationUseCase = makeSendEmailVerificationUseCase();
      const registerRateLimiter = makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) });

      const useCase = new RegisterUseCase({
        ...makeCaptchaDeps(),
        userRepository,
        generateId: vi.fn(),
        sendEmailVerificationUseCase,
        registerRateLimiter,
      });
      const err = await useCase
        .execute({
          email: 'a@example.com',
          password: 'password123',
          ipAddress: '203.0.113.7',
          enforceCaptcha: true,
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('RATE_LIMITED');
      expect(registerRateLimiter.consume).toHaveBeenCalledWith('register:ip:203.0.113.7');
      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(sendEmailVerificationUseCase.execute).not.toHaveBeenCalled();
    });

    it('spends only the email budget when the IP is unknown', async () => {
      const user = makeUser({ id: 'user-1' });
      const registerRateLimiter = makeRateLimiter();

      const useCase = new RegisterUseCase({
        ...makeCaptchaDeps(),
        userRepository: makeUserRepository({
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(user),
        }),
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase: makeSendEmailVerificationUseCase(),
        registerRateLimiter,
      });
      await useCase.execute({
        email: 'a@example.com',
        password: 'password123',
        ipAddress: null,
        enforceCaptcha: true,
      });

      expect(registerRateLimiter.consume).toHaveBeenCalledTimes(1);
      expect(registerRateLimiter.consume).toHaveBeenCalledWith('register:email:a@example.com');
    });

    it('still creates the account when the verification mail is throttled', async () => {
      const user = makeUser({ id: 'user-1' });
      const useCase = new RegisterUseCase({
        ...makeCaptchaDeps(),
        userRepository: makeUserRepository({
          findByEmail: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(user),
        }),
        generateId: vi.fn().mockReturnValue('user-1'),
        sendEmailVerificationUseCase: makeSendEmailVerificationUseCase({
          execute: vi.fn().mockRejectedValue(new RateLimitedError()),
        }),
      });

      await expect(
        useCase.execute({
          email: 'a@example.com',
          password: 'password123',
          ipAddress: '203.0.113.7',
          enforceCaptcha: true,
        }),
      ).resolves.toEqual({ userId: 'user-1', email: 'test@example.com' });
    });
  });
});
