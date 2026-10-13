import type { IRegisterUseCase } from '#src/use-cases/auth/IRegisterUseCase.js';
import type { ILoginUseCase } from '#src/use-cases/auth/ILoginUseCase.js';
import type { ILoginWithTotpUseCase } from '#src/use-cases/auth/ILoginWithTotpUseCase.js';
import type { IReauthenticateUseCase } from '#src/use-cases/auth/IReauthenticateUseCase.js';
import type { IRequestPasswordResetUseCase } from '#src/use-cases/auth/IRequestPasswordResetUseCase.js';
import type { IResetPasswordUseCase } from '#src/use-cases/auth/IResetPasswordUseCase.js';
import type { IVerifyEmailUseCase } from '#src/use-cases/auth/IVerifyEmailUseCase.js';
import type { IRequestBackupEmailRecoveryUseCase } from '#src/use-cases/auth/IRequestBackupEmailRecoveryUseCase.js';
import type { ITokenService, TokenPair } from '#src/use-cases/ports/ITokenService.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { CreateSessionUseCase } from '#src/use-cases/sessions/CreateSessionUseCase.js';
import type { RotateRefreshTokenUseCase } from '#src/use-cases/sessions/RotateRefreshTokenUseCase.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

interface Deps {
  registerUseCase: IRegisterUseCase;
  loginUseCase: ILoginUseCase;
  loginWithTotpUseCase: ILoginWithTotpUseCase;
  reauthenticateUseCase: IReauthenticateUseCase;
  tokenService: ITokenService;
  requestPasswordResetUseCase: IRequestPasswordResetUseCase;
  resetPasswordUseCase: IResetPasswordUseCase;
  createSessionUseCase: CreateSessionUseCase;
  rotateRefreshTokenUseCase: RotateRefreshTokenUseCase;
  sessionRepository: ISessionRepository;
  verifyEmailUseCase: IVerifyEmailUseCase;
  requestBackupEmailRecoveryUseCase: IRequestBackupEmailRecoveryUseCase;
}

export interface DeviceInfo {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface LoginResult {
  totpRequired: boolean;
  tokens: TokenPair | null;
}

export class AuthResolver {
  constructor(private readonly deps: Deps) {}

  async register(email: string, password: string, device: DeviceInfo): Promise<TokenPair> {
    const { userId } = await this.deps.registerUseCase.execute({
      email,
      password,
      ipAddress: device.ipAddress,
    });
    const session = await this.deps.createSessionUseCase.execute({ userId, ...device });
    return this.deps.tokenService.sign(
      userId,
      email,
      session.id,
      session.currentRefreshTokenId!,
      Date.now(),
    );
  }

  async login(email: string, password: string, device: DeviceInfo): Promise<LoginResult> {
    const user = await this.deps.loginUseCase.execute({
      email,
      password,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
    if (user.totpEnabled) {
      // Login isn't complete until TOTP is verified — no session yet.
      return { totpRequired: true, tokens: null };
    }
    const session = await this.deps.createSessionUseCase.execute({ userId: user.id, ...device });
    return {
      totpRequired: false,
      tokens: this.deps.tokenService.sign(
        user.id,
        user.email,
        session.id,
        session.currentRefreshTokenId!,
        Date.now(),
      ),
    };
  }

  async loginWithTotp(
    email: string,
    password: string,
    code: string,
    device: DeviceInfo,
  ): Promise<TokenPair> {
    const user = await this.deps.loginWithTotpUseCase.execute({
      email,
      password,
      code,
      ipAddress: device.ipAddress,
    });
    const session = await this.deps.createSessionUseCase.execute({ userId: user.id, ...device });
    return this.deps.tokenService.sign(
      user.id,
      user.email,
      session.id,
      session.currentRefreshTokenId!,
      Date.now(),
    );
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const payload = this.deps.tokenService.verifyRefresh(refreshToken);
    const { newTokenId } = await this.deps.rotateRefreshTokenUseCase.execute({
      sessionId: payload.sid,
      presentedTokenId: payload.jti ?? null,
    });
    // Refreshing must not reset freshness — carry the original authTime
    // forward so a stale (or pre-JEF-44, `undefined`) session stays stale
    // until the user actually reauthenticates via login or `reauthenticate`.
    return this.deps.tokenService.sign(
      payload.sub,
      payload.email,
      payload.sid,
      newTokenId,
      payload.authTime ?? 0,
    );
  }

  async reauthenticate(
    userId: string,
    sessionId: string,
    password: string,
    code: string | undefined,
  ): Promise<LoginResult> {
    const result = await this.deps.reauthenticateUseCase.execute({ userId, password, code });
    if (result.totpRequired) {
      return { totpRequired: true, tokens: null };
    }

    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw Object.assign(new Error('Session expired — please log in again'), {
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    return {
      totpRequired: false,
      tokens: this.deps.tokenService.sign(
        result.user.id,
        result.user.email,
        session.id,
        session.currentRefreshTokenId!,
        Date.now(),
      ),
    };
  }

  async verifyEmail(token: string): Promise<void> {
    await this.deps.verifyEmailUseCase.execute({ token });
  }

  async requestPasswordReset(email: string, ipAddress: string | null): Promise<void> {
    await this.deps.requestPasswordResetUseCase.execute({ email, ipAddress });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.deps.resetPasswordUseCase.execute({ token, newPassword });
  }

  async requestBackupEmailRecovery(backupEmail: string, ipAddress: string | null): Promise<void> {
    await this.deps.requestBackupEmailRecoveryUseCase.execute({ backupEmail, ipAddress });
  }
}
