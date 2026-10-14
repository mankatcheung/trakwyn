import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthResolver } from '#src/interface-adapters/resolvers/AuthResolver.js';
import { makeSession, makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';
import type { IRegisterUseCase } from '#src/use-cases/auth/IRegisterUseCase.js';
import type { ILoginUseCase } from '#src/use-cases/auth/ILoginUseCase.js';
import type { ILoginWithTotpUseCase } from '#src/use-cases/auth/ILoginWithTotpUseCase.js';
import type { IReauthenticateUseCase } from '#src/use-cases/auth/IReauthenticateUseCase.js';
import type { IRequestPasswordResetUseCase } from '#src/use-cases/auth/IRequestPasswordResetUseCase.js';
import type { IResetPasswordUseCase } from '#src/use-cases/auth/IResetPasswordUseCase.js';
import type { IVerifyEmailUseCase } from '#src/use-cases/auth/IVerifyEmailUseCase.js';
import type { IRequestBackupEmailRecoveryUseCase } from '#src/use-cases/auth/IRequestBackupEmailRecoveryUseCase.js';
import type { ITokenService } from '#src/use-cases/ports/ITokenService.js';
import type { CreateSessionUseCase } from '#src/use-cases/sessions/CreateSessionUseCase.js';
import type { RotateRefreshTokenUseCase } from '#src/use-cases/sessions/RotateRefreshTokenUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeRegisterUseCase = (overrides?: Partial<IRegisterUseCase>): IRegisterUseCase => ({
  execute: vi.fn(),
  ...overrides,
});

const makeLoginUseCase = (overrides?: Partial<ILoginUseCase>): ILoginUseCase => ({
  execute: vi.fn(),
  ...overrides,
});

const makeLoginWithTotpUseCase = (
  overrides?: Partial<ILoginWithTotpUseCase>,
): ILoginWithTotpUseCase => ({
  execute: vi.fn(),
  ...overrides,
});

const makeReauthenticateUseCase = (
  overrides?: Partial<IReauthenticateUseCase>,
): IReauthenticateUseCase => ({
  execute: vi.fn(),
  ...overrides,
});

const makeRequestPasswordResetUseCase = (
  overrides?: Partial<IRequestPasswordResetUseCase>,
): IRequestPasswordResetUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeResetPasswordUseCase = (
  overrides?: Partial<IResetPasswordUseCase>,
): IResetPasswordUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeVerifyEmailUseCase = (overrides?: Partial<IVerifyEmailUseCase>): IVerifyEmailUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeTokenService = (overrides?: Partial<ITokenService>): ITokenService => ({
  sign: vi.fn().mockReturnValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
  verifyRefresh: vi.fn(),
  verifyAccess: vi.fn(),
  ...overrides,
});

const device = { userAgent: 'test-agent', ipAddress: '127.0.0.1' };

const baseDeps = () => ({
  registerUseCase: makeRegisterUseCase(),
  loginUseCase: makeLoginUseCase(),
  loginWithTotpUseCase: makeLoginWithTotpUseCase(),
  reauthenticateUseCase: makeReauthenticateUseCase(),
  tokenService: makeTokenService(),
  requestPasswordResetUseCase: makeRequestPasswordResetUseCase(),
  resetPasswordUseCase: makeResetPasswordUseCase(),
  createSessionUseCase: stub<CreateSessionUseCase>({
    execute: vi.fn().mockResolvedValue(makeSession()),
  }),
  rotateRefreshTokenUseCase: stub<RotateRefreshTokenUseCase>({
    execute: vi
      .fn()
      .mockResolvedValue({ session: makeSession(), newTokenId: 'new-refresh-token-id' }),
  }),
  sessionRepository: makeSessionRepository(),
  verifyEmailUseCase: makeVerifyEmailUseCase(),
  requestBackupEmailRecoveryUseCase: stub<IRequestBackupEmailRecoveryUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
});

describe('AuthResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('registers, creates a session, and returns a token pair', async () => {
      const registerUseCase = makeRegisterUseCase({
        execute: vi.fn().mockResolvedValue({ userId: 'user-1', email: 'test@example.com' }),
      });
      const tokenService = makeTokenService();
      const createSessionUseCase = stub<CreateSessionUseCase>({
        execute: vi.fn().mockResolvedValue(makeSession({ id: 'session-1' })),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        registerUseCase,
        tokenService,
        createSessionUseCase,
      });

      const result = await resolver.register('test@example.com', 'password123', device, {
        token: 'captcha-token',
        enforce: true,
      });

      expect(registerUseCase.execute).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        ipAddress: '127.0.0.1',
        captchaToken: 'captcha-token',
        enforceCaptcha: true,
      });
      expect(createSessionUseCase.execute).toHaveBeenCalledWith({ userId: 'user-1', ...device });
      expect(tokenService.sign).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
        'session-1',
        'refresh-token-id-1',
        expect.any(Number),
      );
      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });
  });

  describe('login', () => {
    it('logs in, creates a session, and returns totpRequired: false for a user without 2FA', async () => {
      const user = makeUser({ totpEnabled: false });
      const loginUseCase = makeLoginUseCase({ execute: vi.fn().mockResolvedValue(user) });
      const tokenService = makeTokenService();
      const createSessionUseCase = stub<CreateSessionUseCase>({
        execute: vi.fn().mockResolvedValue(makeSession({ id: 'session-1' })),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        loginUseCase,
        tokenService,
        createSessionUseCase,
      });

      const result = await resolver.login('test@example.com', 'password123', device, {
        token: 'captcha-token',
        enforce: true,
      });

      expect(loginUseCase.execute).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        captchaToken: 'captcha-token',
        enforceCaptcha: true,
      });
      expect(createSessionUseCase.execute).toHaveBeenCalledWith({ userId: user.id, ...device });
      expect(tokenService.sign).toHaveBeenCalledWith(
        user.id,
        user.email,
        'session-1',
        'refresh-token-id-1',
        expect.any(Number),
      );
      expect(result).toEqual({
        totpRequired: false,
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });
    });

    it('does not create a session or sign tokens for a user with 2FA enabled', async () => {
      const user = makeUser({ totpEnabled: true });
      const loginUseCase = makeLoginUseCase({ execute: vi.fn().mockResolvedValue(user) });
      const tokenService = makeTokenService();
      const createSessionUseCase = stub<CreateSessionUseCase>({ execute: vi.fn() });

      const resolver = new AuthResolver({
        ...baseDeps(),
        loginUseCase,
        tokenService,
        createSessionUseCase,
      });

      const result = await resolver.login('test@example.com', 'password123', device, {
        enforce: true,
      });

      expect(createSessionUseCase.execute).not.toHaveBeenCalled();
      expect(tokenService.sign).not.toHaveBeenCalled();
      expect(result).toEqual({ totpRequired: true, tokens: null });
    });
  });

  describe('loginWithTotp', () => {
    it('delegates to loginWithTotpUseCase, creates a session, and signs tokens', async () => {
      const user = makeUser({ totpEnabled: true });
      const loginWithTotpUseCase = makeLoginWithTotpUseCase({
        execute: vi.fn().mockResolvedValue(user),
      });
      const tokenService = makeTokenService();
      const createSessionUseCase = stub<CreateSessionUseCase>({
        execute: vi.fn().mockResolvedValue(makeSession({ id: 'session-1' })),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        loginWithTotpUseCase,
        tokenService,
        createSessionUseCase,
      });

      const result = await resolver.loginWithTotp(
        'test@example.com',
        'password123',
        '123456',
        device,
      );

      expect(loginWithTotpUseCase.execute).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        code: '123456',
        ipAddress: device.ipAddress,
      });
      expect(createSessionUseCase.execute).toHaveBeenCalledWith({ userId: user.id, ...device });
      expect(tokenService.sign).toHaveBeenCalledWith(
        user.id,
        user.email,
        'session-1',
        'refresh-token-id-1',
        expect.any(Number),
      );
      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('Invalid verification code'), {
        code: 'UNAUTHORIZED',
      });
      const loginWithTotpUseCase = makeLoginWithTotpUseCase({
        execute: vi.fn().mockRejectedValue(err),
      });
      const resolver = new AuthResolver({ ...baseDeps(), loginWithTotpUseCase });

      await expect(
        resolver.loginWithTotp('test@example.com', 'password123', 'bad-code', device),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('refreshToken', () => {
    it('verifies the refresh token, rotates the session, and returns a new token pair', async () => {
      const tokenService = makeTokenService({
        verifyRefresh: vi.fn().mockReturnValue({
          sub: 'user-1',
          email: 'test@example.com',
          sid: 'session-1',
          jti: 'old-refresh-token-id',
        }),
      });
      const rotateRefreshTokenUseCase = stub<RotateRefreshTokenUseCase>({
        execute: vi.fn().mockResolvedValue({
          session: makeSession({ id: 'session-1' }),
          newTokenId: 'new-refresh-token-id',
        }),
      });

      const resolver = new AuthResolver({ ...baseDeps(), tokenService, rotateRefreshTokenUseCase });

      const result = await resolver.refreshToken('valid-refresh-token');

      expect(tokenService.verifyRefresh).toHaveBeenCalledWith('valid-refresh-token');
      expect(rotateRefreshTokenUseCase.execute).toHaveBeenCalledWith({
        sessionId: 'session-1',
        presentedTokenId: 'old-refresh-token-id',
      });
      expect(tokenService.sign).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
        'session-1',
        'new-refresh-token-id',
        0,
      );
      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });

    it('carries the original authTime forward instead of resetting freshness', async () => {
      const tokenService = makeTokenService({
        verifyRefresh: vi.fn().mockReturnValue({
          sub: 'user-1',
          email: 'test@example.com',
          sid: 'session-1',
          jti: 'old-refresh-token-id',
          authTime: 1_700_000_000_000,
        }),
      });
      const rotateRefreshTokenUseCase = stub<RotateRefreshTokenUseCase>({
        execute: vi.fn().mockResolvedValue({
          session: makeSession({ id: 'session-1' }),
          newTokenId: 'new-refresh-token-id',
        }),
      });

      const resolver = new AuthResolver({ ...baseDeps(), tokenService, rotateRefreshTokenUseCase });

      await resolver.refreshToken('valid-refresh-token');

      expect(tokenService.sign).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
        'session-1',
        'new-refresh-token-id',
        1_700_000_000_000,
      );
    });

    it('passes null as presentedTokenId for a legacy refresh token with no jti', async () => {
      const tokenService = makeTokenService({
        verifyRefresh: vi
          .fn()
          .mockReturnValue({ sub: 'user-1', email: 'test@example.com', sid: 'session-1' }),
      });
      const rotateRefreshTokenUseCase = stub<RotateRefreshTokenUseCase>({
        execute: vi.fn().mockResolvedValue({
          session: makeSession({ id: 'session-1' }),
          newTokenId: 'new-refresh-token-id',
        }),
      });

      const resolver = new AuthResolver({ ...baseDeps(), tokenService, rotateRefreshTokenUseCase });

      await resolver.refreshToken('legacy-refresh-token');

      expect(rotateRefreshTokenUseCase.execute).toHaveBeenCalledWith({
        sessionId: 'session-1',
        presentedTokenId: null,
      });
    });

    it('throws UNAUTHORIZED when the refresh token is invalid', async () => {
      const tokenService = makeTokenService({
        verifyRefresh: vi.fn().mockImplementation(() => {
          throw Object.assign(new Error('Invalid refresh token'), { code: 'UNAUTHORIZED' });
        }),
      });

      const resolver = new AuthResolver({ ...baseDeps(), tokenService });

      const err = await resolver.refreshToken('expired-token').catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    });

    it('throws UNAUTHORIZED when the session has been revoked or the token reused', async () => {
      const tokenService = makeTokenService({
        verifyRefresh: vi.fn().mockReturnValue({
          sub: 'user-1',
          email: 'test@example.com',
          sid: 'session-1',
          jti: 'stale-refresh-token-id',
        }),
      });
      const rotateRefreshTokenUseCase = stub<RotateRefreshTokenUseCase>({
        execute: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Session revoked or expired'), { code: 'UNAUTHORIZED' }),
          ),
      });

      const resolver = new AuthResolver({ ...baseDeps(), tokenService, rotateRefreshTokenUseCase });

      const err = await resolver.refreshToken('valid-refresh-token').catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
      expect(tokenService.sign).not.toHaveBeenCalled();
    });
  });

  describe('reauthenticate', () => {
    it('re-signs tokens for the existing session once verified', async () => {
      const user = makeUser({ id: 'user-1', email: 'test@example.com' });
      const reauthenticateUseCase = makeReauthenticateUseCase({
        execute: vi.fn().mockResolvedValue({ user, totpRequired: false }),
      });
      const tokenService = makeTokenService();
      const sessionRepository = makeSessionRepository({
        findById: vi
          .fn()
          .mockResolvedValue(
            makeSession({ id: 'session-1', expiresAt: new Date(Date.now() + 60_000) }),
          ),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        reauthenticateUseCase,
        tokenService,
        sessionRepository,
      });

      const result = await resolver.reauthenticate('user-1', 'session-1', 'password123', undefined);

      expect(reauthenticateUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        password: 'password123',
        code: undefined,
      });
      expect(sessionRepository.findById).toHaveBeenCalledWith('session-1');
      expect(tokenService.sign).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
        'session-1',
        'refresh-token-id-1',
        expect.any(Number),
      );
      expect(result).toEqual({
        totpRequired: false,
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });
    });

    it('returns totpRequired without touching the session when a code is still needed', async () => {
      const user = makeUser({ id: 'user-1', totpEnabled: true });
      const reauthenticateUseCase = makeReauthenticateUseCase({
        execute: vi.fn().mockResolvedValue({ user, totpRequired: true }),
      });
      const tokenService = makeTokenService();
      const sessionRepository = makeSessionRepository();

      const resolver = new AuthResolver({
        ...baseDeps(),
        reauthenticateUseCase,
        tokenService,
        sessionRepository,
      });

      const result = await resolver.reauthenticate('user-1', 'session-1', 'password123', undefined);

      expect(sessionRepository.findById).not.toHaveBeenCalled();
      expect(tokenService.sign).not.toHaveBeenCalled();
      expect(result).toEqual({ totpRequired: true, tokens: null });
    });

    it('propagates errors from the use case (e.g. wrong password)', async () => {
      const err = Object.assign(new Error('Invalid credentials'), { code: 'UNAUTHORIZED' });
      const reauthenticateUseCase = makeReauthenticateUseCase({
        execute: vi.fn().mockRejectedValue(err),
      });
      const resolver = new AuthResolver({ ...baseDeps(), reauthenticateUseCase });

      await expect(
        resolver.reauthenticate('user-1', 'session-1', 'wrong-password', undefined),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('throws UNAUTHORIZED when the session no longer exists', async () => {
      const user = makeUser({ id: 'user-1' });
      const reauthenticateUseCase = makeReauthenticateUseCase({
        execute: vi.fn().mockResolvedValue({ user, totpRequired: false }),
      });
      const sessionRepository = makeSessionRepository({
        findById: vi.fn().mockResolvedValue(null),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        reauthenticateUseCase,
        sessionRepository,
      });

      const err = await resolver
        .reauthenticate('user-1', 'session-1', 'password123', undefined)
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    });

    it('throws UNAUTHORIZED when the session has been revoked', async () => {
      const user = makeUser({ id: 'user-1' });
      const reauthenticateUseCase = makeReauthenticateUseCase({
        execute: vi.fn().mockResolvedValue({ user, totpRequired: false }),
      });
      const sessionRepository = makeSessionRepository({
        findById: vi.fn().mockResolvedValue(makeSession({ revokedAt: new Date('2024-01-01') })),
      });

      const resolver = new AuthResolver({
        ...baseDeps(),
        reauthenticateUseCase,
        sessionRepository,
      });

      const err = await resolver
        .reauthenticate('user-1', 'session-1', 'password123', undefined)
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    });
  });

  describe('verifyEmail', () => {
    it('delegates to verifyEmailUseCase with the given token', async () => {
      const verifyEmailUseCase = makeVerifyEmailUseCase();
      const resolver = new AuthResolver({ ...baseDeps(), verifyEmailUseCase });

      await resolver.verifyEmail('raw-token');

      expect(verifyEmailUseCase.execute).toHaveBeenCalledWith({ token: 'raw-token' });
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('Invalid or expired verification link'), {
        code: 'UNAUTHORIZED',
      });
      const verifyEmailUseCase = makeVerifyEmailUseCase({
        execute: vi.fn().mockRejectedValue(err),
      });
      const resolver = new AuthResolver({ ...baseDeps(), verifyEmailUseCase });

      await expect(resolver.verifyEmail('bad-token')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('delegates to requestPasswordResetUseCase with the given email and IP', async () => {
      const requestPasswordResetUseCase = makeRequestPasswordResetUseCase();
      const resolver = new AuthResolver({ ...baseDeps(), requestPasswordResetUseCase });

      await resolver.requestPasswordReset('test@example.com', '127.0.0.1', {
        token: 'captcha-token',
        enforce: true,
      });

      expect(requestPasswordResetUseCase.execute).toHaveBeenCalledWith({
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        captchaToken: 'captcha-token',
        enforceCaptcha: true,
      });
    });

    it('passes enforceCaptcha: false for a client that cannot show one', async () => {
      const requestPasswordResetUseCase = makeRequestPasswordResetUseCase();
      const resolver = new AuthResolver({ ...baseDeps(), requestPasswordResetUseCase });

      await resolver.requestPasswordReset('test@example.com', '127.0.0.1', { enforce: false });

      expect(requestPasswordResetUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enforceCaptcha: false }),
      );
    });
  });

  describe('resetPassword', () => {
    it('delegates to resetPasswordUseCase with the token and new password', async () => {
      const resetPasswordUseCase = makeResetPasswordUseCase();
      const resolver = new AuthResolver({ ...baseDeps(), resetPasswordUseCase });

      await resolver.resetPassword('raw-token', 'newPassword123');

      expect(resetPasswordUseCase.execute).toHaveBeenCalledWith({
        token: 'raw-token',
        newPassword: 'newPassword123',
      });
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('Invalid or expired reset link'), {
        code: 'UNAUTHORIZED',
      });
      const resetPasswordUseCase = makeResetPasswordUseCase({
        execute: vi.fn().mockRejectedValue(err),
      });
      const resolver = new AuthResolver({ ...baseDeps(), resetPasswordUseCase });

      await expect(resolver.resetPassword('bad-token', 'newPassword123')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });
});
