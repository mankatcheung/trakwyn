import {
  RateLimitedError,
  UnauthorizedError,
  UserNotFoundError,
} from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILoginEventRepository } from '#src/use-cases/ports/ILoginEventRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ILoginUseCase, LoginInput, LoginOutput } from '#src/use-cases/auth/ILoginUseCase.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { assertCaptcha } from '#src/use-cases/auth/assertCaptcha.js';
import { logAuthFailure } from '#src/use-cases/auth/logAuthFailure.js';
import { AUTH_FAILURE_EVENTS } from '#src/use-cases/constants.js';

interface Deps {
  userRepository: IUserRepository;
  loginEventRepository: ILoginEventRepository;
  generateId: () => string;
  logger: ILogger;
  captchaVerifier: ICaptchaVerifier;
  loginRateLimiter: IRateLimiter;
  loginFailureRateLimiter: IRateLimiter;
}

export class LoginUseCase implements ILoginUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const failureKeys = this.failureKeys(input);
    await this.assertWithinAttemptLimit(input);
    if (input.enforceCaptcha && (await this.hasRepeatedFailures(failureKeys))) {
      await assertCaptcha(this.deps.captchaVerifier, input.captchaToken, input.ipAddress);
    }

    const user = await this.deps.userRepository.findByEmail(input.email);
    if (!user) {
      await this.recordFailure(failureKeys, 'invalid_credentials');
      throw new UserNotFoundError('No account found with this email. Please register first.');
    }
    if (user.passwordHash === null) this.logFailure('no_password');
    assertHasPassword(user.passwordHash);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      await this.recordFailure(failureKeys, 'invalid_credentials');
      throw new UnauthorizedError('Invalid credentials');
    }

    await this.deps.loginEventRepository.create({
      id: this.deps.generateId(),
      userId: user.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return user;
  }

  /**
   * Failed-login counters (JEF-401), by email and by IP. An unknown email is
   * counted like a wrong password, so whether the captcha appears does not
   * reveal whether the account exists.
   */
  private failureKeys(input: LoginInput): string[] {
    const keys = [`login-failure:email:${input.email.toLowerCase()}`];
    if (input.ipAddress) keys.push(`login-failure:ip:${input.ipAddress}`);
    return keys;
  }

  /** The ceiling on attempts of any outcome, which no captcha lifts. */
  private async assertWithinAttemptLimit(input: LoginInput): Promise<void> {
    const emailAllowed = await this.deps.loginRateLimiter.consume(
      `login:email:${input.email.toLowerCase()}`,
    );
    const ipAllowed = input.ipAddress
      ? await this.deps.loginRateLimiter.consume(`login:ip:${input.ipAddress}`)
      : true;
    if (!emailAllowed || !ipAllowed) {
      throw new RateLimitedError('Too many login attempts. Try again later.');
    }
  }

  private async hasRepeatedFailures(keys: string[]): Promise<boolean> {
    const limited = await Promise.all(
      keys.map((key) => this.deps.loginFailureRateLimiter.isLimited(key)),
    );
    return limited.some(Boolean);
  }

  private async recordFailure(
    keys: string[],
    reason: 'invalid_credentials' | 'no_password',
  ): Promise<void> {
    await Promise.all(keys.map((key) => this.deps.loginFailureRateLimiter.consume(key)));
    this.logFailure(reason);
  }

  // `LoginEvent` records successes only, so a refusal is logged here or
  // nowhere (JEF-354).
  private logFailure(reason: 'invalid_credentials' | 'no_password'): void {
    logAuthFailure(this.deps.logger, AUTH_FAILURE_EVENTS.LOGIN_FAILED, reason);
  }
}
