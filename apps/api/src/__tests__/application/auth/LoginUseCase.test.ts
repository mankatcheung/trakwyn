import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { LoginUseCase } from '#src/use-cases/auth/LoginUseCase.js';
import { makeLoginEventRepository } from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeCaptchaVerifier,
  makeLogger,
  makeRateLimiter,
} from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

describe('LoginUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeDeps = (overrides?: object) => ({
    userRepository: makeUserRepository(),
    loginEventRepository: makeLoginEventRepository(),
    generateId: vi.fn().mockReturnValue('event-1'),
    logger: makeLogger(),
    captchaVerifier: makeCaptchaVerifier(),
    loginRateLimiter: makeRateLimiter(),
    loginFailureRateLimiter: makeRateLimiter(),
    ...overrides,
  });

  const warnFields = (logger: ILogger) => vi.mocked(logger.warn).mock.calls.map(([, , f]) => f);

  it('returns the user when credentials are valid', async () => {
    const user = makeUser();
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const useCase = new LoginUseCase(deps);
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      enforceCaptcha: true,
    });

    expect(result).toEqual(user);
    expect(deps.logger.warn).not.toHaveBeenCalled();
    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('password123', user.passwordHash);
    expect(loginEventRepository.create).toHaveBeenCalledWith({
      id: 'event-1',
      userId: user.id,
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('records a login event with null ip/userAgent when not provided', async () => {
    const user = makeUser();
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(user) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const useCase = new LoginUseCase(deps);
    await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      enforceCaptcha: true,
    });

    expect(loginEventRepository.create).toHaveBeenCalledWith({
      id: 'event-1',
      userId: user.id,
      ipAddress: null,
      userAgent: null,
    });
  });

  it('throws USER_NOT_FOUND when user is not found', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) }),
      loginEventRepository,
    });

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({ email: 'nobody@example.com', password: 'pass', enforceCaptcha: true })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('USER_NOT_FOUND');
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'invalid_credentials', userId: undefined },
    ]);
  });

  it('throws UNAUTHORIZED when password does not match', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(makeUser()) }),
      loginEventRepository,
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({
        email: 'test@example.com',
        password: 'wrong',
        ipAddress: '203.0.113.9',
        userAgent: 'test-agent',
        enforceCaptcha: true,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    // Indistinguishable from an unknown email: same reason, no user id.
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'invalid_credentials', userId: undefined },
    ]);
    const logged = JSON.stringify(vi.mocked(deps.logger.warn).mock.calls);
    for (const pii of ['test@example.com', 'wrong', '203.0.113.9', 'test-agent']) {
      expect(logged).not.toContain(pii);
    }
  });

  it('throws UNAUTHORIZED (not a bcrypt crash) for an OAuth-only account with no password', async () => {
    const loginEventRepository = makeLoginEventRepository();
    const deps = makeDeps({
      userRepository: makeUserRepository({
        findByEmail: vi.fn().mockResolvedValue(makeUser({ passwordHash: null })),
      }),
      loginEventRepository,
    });

    const useCase = new LoginUseCase(deps);
    const err = await useCase
      .execute({ email: 'test@example.com', password: 'anything', enforceCaptcha: true })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(vi.mocked(bcrypt.compare)).not.toHaveBeenCalled();
    expect(loginEventRepository.create).not.toHaveBeenCalled();
    expect(warnFields(deps.logger)).toEqual([
      { event: 'auth.login.failed', reason: 'no_password', userId: undefined },
    ]);
  });
  describe('captcha and attempt limits (JEF-401)', () => {
    const credentials = {
      email: 'Test@Example.com',
      password: 'password123',
      ipAddress: '203.0.113.9',
      enforceCaptcha: true,
    };
    const validUser = () =>
      makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(makeUser()) });
    const code = (err: unknown) => (err as { code: string }).code;

    it('asks for no captcha while there are few failures', async () => {
      const captchaVerifier = makeCaptchaVerifier();
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      const useCase = new LoginUseCase(makeDeps({ userRepository: validUser(), captchaVerifier }));

      await useCase.execute(credentials);

      expect(captchaVerifier.verify).not.toHaveBeenCalled();
    });

    it('requires a captcha once the email has repeated failures', async () => {
      const loginFailureRateLimiter = makeRateLimiter({
        isLimited: vi.fn(async (key: string) => key === 'login-failure:email:test@example.com'),
      });
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });
      const useCase = new LoginUseCase(
        makeDeps({ userRepository: validUser(), captchaVerifier, loginFailureRateLimiter }),
      );

      const err = await useCase.execute(credentials).catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_REQUIRED');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('requires a captcha once the IP has repeated failures', async () => {
      const loginFailureRateLimiter = makeRateLimiter({
        isLimited: vi.fn(async (key: string) => key === 'login-failure:ip:203.0.113.9'),
      });
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });
      const useCase = new LoginUseCase(
        makeDeps({ userRepository: validUser(), captchaVerifier, loginFailureRateLimiter }),
      );

      const err = await useCase.execute(credentials).catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_REQUIRED');
    });

    it('rejects a captcha token the verifier refuses', async () => {
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });
      const useCase = new LoginUseCase(
        makeDeps({
          userRepository: validUser(),
          captchaVerifier,
          loginFailureRateLimiter: makeRateLimiter({ isLimited: vi.fn().mockResolvedValue(true) }),
        }),
      );

      const err = await useCase.execute({ ...credentials, captchaToken: 'bad' }).catch((e) => e);

      expect(code(err)).toBe('CAPTCHA_FAILED');
      expect(captchaVerifier.verify).toHaveBeenCalledWith('bad', '203.0.113.9');
    });

    it('logs in when a valid captcha accompanies repeated failures', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      const useCase = new LoginUseCase(
        makeDeps({
          userRepository: validUser(),
          loginFailureRateLimiter: makeRateLimiter({ isLimited: vi.fn().mockResolvedValue(true) }),
        }),
      );

      await expect(useCase.execute({ ...credentials, captchaToken: 'good' })).resolves.toBeTruthy();
    });

    it('never asks a client that cannot show a captcha', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      const captchaVerifier = makeCaptchaVerifier({ verify: vi.fn().mockResolvedValue(false) });
      const useCase = new LoginUseCase(
        makeDeps({
          userRepository: validUser(),
          captchaVerifier,
          loginFailureRateLimiter: makeRateLimiter({ isLimited: vi.fn().mockResolvedValue(true) }),
        }),
      );

      await expect(
        useCase.execute({ ...credentials, enforceCaptcha: false }),
      ).resolves.toBeTruthy();
      expect(captchaVerifier.verify).not.toHaveBeenCalled();
    });

    it('counts a wrong password against the email and the IP', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      const loginFailureRateLimiter = makeRateLimiter();
      const useCase = new LoginUseCase(
        makeDeps({ userRepository: validUser(), loginFailureRateLimiter }),
      );

      await useCase.execute(credentials).catch(() => undefined);

      expect(loginFailureRateLimiter.consume).toHaveBeenCalledWith(
        'login-failure:email:test@example.com',
      );
      expect(loginFailureRateLimiter.consume).toHaveBeenCalledWith('login-failure:ip:203.0.113.9');
    });

    it('counts an unknown email the same way, so the captcha reveals nothing', async () => {
      const loginFailureRateLimiter = makeRateLimiter();
      const useCase = new LoginUseCase(
        makeDeps({
          userRepository: makeUserRepository({ findByEmail: vi.fn().mockResolvedValue(null) }),
          loginFailureRateLimiter,
        }),
      );

      await useCase.execute(credentials).catch(() => undefined);

      expect(loginFailureRateLimiter.consume).toHaveBeenCalledWith(
        'login-failure:email:test@example.com',
      );
    });

    it('does not count a successful login as a failure', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      const loginFailureRateLimiter = makeRateLimiter();
      const useCase = new LoginUseCase(
        makeDeps({ userRepository: validUser(), loginFailureRateLimiter }),
      );

      await useCase.execute(credentials);

      expect(loginFailureRateLimiter.consume).not.toHaveBeenCalled();
    });

    it('refuses once the per-email attempt ceiling is spent, captcha or not', async () => {
      const loginRateLimiter = makeRateLimiter({
        consume: vi.fn(async (key: string) => !key.startsWith('login:email:')),
      });
      const useCase = new LoginUseCase(makeDeps({ userRepository: validUser(), loginRateLimiter }));

      const err = await useCase.execute({ ...credentials, enforceCaptcha: false }).catch((e) => e);

      expect(code(err)).toBe('RATE_LIMITED');
      expect(loginRateLimiter.consume).toHaveBeenCalledWith('login:email:test@example.com');
    });

    it('refuses once the per-IP attempt ceiling is spent', async () => {
      const loginRateLimiter = makeRateLimiter({
        consume: vi.fn(async (key: string) => !key.startsWith('login:ip:')),
      });
      const useCase = new LoginUseCase(makeDeps({ userRepository: validUser(), loginRateLimiter }));

      const err = await useCase.execute(credentials).catch((e) => e);

      expect(code(err)).toBe('RATE_LIMITED');
    });
  });
});
