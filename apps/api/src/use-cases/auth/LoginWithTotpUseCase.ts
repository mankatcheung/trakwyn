import { RateLimitedError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { User } from '#src/domain/user/User.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ITotpBackupCodeRepository } from '#src/use-cases/ports/ITotpBackupCodeRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { verifyTotpOrBackupCode } from '#src/use-cases/auth/verifyTotpOrBackupCode.js';
import { logAuthFailure, type AuthFailureReason } from '#src/use-cases/auth/logAuthFailure.js';
import { AUTH_FAILURE_EVENTS } from '#src/use-cases/constants.js';
import type {
  ILoginWithTotpUseCase,
  LoginWithTotpInput,
} from '#src/use-cases/auth/ILoginWithTotpUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  totpBackupCodeRepository: ITotpBackupCodeRepository;
  totpRateLimiter: IRateLimiter;
  totpProvider: ITotpProvider;
  logger: ILogger;
}

export class LoginWithTotpUseCase implements ILoginWithTotpUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: LoginWithTotpInput): Promise<User> {
    const user = await this.deps.userRepository.findByEmail(input.email);
    if (!user) {
      this.logFailure('invalid_credentials');
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.passwordHash === null) this.logFailure('no_password');
    assertHasPassword(user.passwordHash);
    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      this.logFailure('invalid_credentials');
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.totpEnabled || !user.totpSecret) {
      this.logFailure('invalid_credentials');
      throw new UnauthorizedError('Invalid credentials');
    }

    const allowedByEmail = await this.deps.totpRateLimiter.consume(
      `totp:email:${input.email.toLowerCase()}`,
    );
    const allowedByIp = input.ipAddress
      ? await this.deps.totpRateLimiter.consume(`totp:ip:${input.ipAddress}`)
      : true;
    if (!allowedByEmail || !allowedByIp) {
      throw new RateLimitedError('Too many verification attempts. Please try again later.');
    }

    const validCode = await verifyTotpOrBackupCode(
      this.deps,
      { id: user.id, totpSecret: user.totpSecret },
      input.code,
    );
    if (!validCode) {
      // The password was right, so this account's password is known to
      // whoever is guessing codes — the user id is what makes that visible.
      this.logFailure('invalid_code', user.id);
      throw new UnauthorizedError('Invalid verification code');
    }

    return user;
  }

  private logFailure(reason: AuthFailureReason, userId?: string): void {
    logAuthFailure(this.deps.logger, AUTH_FAILURE_EVENTS.TOTP_FAILED, reason, userId);
  }
}
