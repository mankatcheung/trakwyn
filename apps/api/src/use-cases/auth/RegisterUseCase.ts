import { ConflictError, RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { ICaptchaVerifier } from '#src/use-cases/ports/ICaptchaVerifier.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { assertCaptcha } from '#src/use-cases/auth/assertCaptcha.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ISendEmailVerificationUseCase } from '#src/use-cases/auth/ISendEmailVerificationUseCase.js';
import { assertValidPassword } from '#src/use-cases/auth/passwordValidation.js';
import type {
  IRegisterUseCase,
  RegisterInput,
  RegisterOutput,
} from '#src/use-cases/auth/IRegisterUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  generateId: () => string;
  sendEmailVerificationUseCase: ISendEmailVerificationUseCase;
  captchaVerifier: ICaptchaVerifier;
  registerRateLimiter: IRateLimiter;
  registerWithoutCaptchaRateLimiter: IRateLimiter;
}

export class RegisterUseCase implements IRegisterUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    await this.assertNotAbusive(input);
    assertValidPassword(input.password);

    const existing = await this.deps.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.deps.userRepository.create({
      id: this.deps.generateId(),
      email: input.email,
      passwordHash,
    });

    try {
      await this.deps.sendEmailVerificationUseCase.execute(user.id);
    } catch {
      // Verification email delivery is non-critical — don't block account
      // creation if the email provider is down or unconfigured (e.g. local dev).
    }

    return { userId: user.id, email: user.email };
  }

  /**
   * Every sign-up sends a verification email, so this is what stops register
   * being used to bulk-create accounts or to mail a stranger (JEF-401). A
   * client that cannot show a captcha gets the tighter budget instead.
   */
  private async assertNotAbusive(input: RegisterInput): Promise<void> {
    if (input.enforceCaptcha) {
      await assertCaptcha(this.deps.captchaVerifier, input.captchaToken, input.ipAddress);
    }

    // The two budgets get their own key prefix: the Redis limiter keys on the
    // string alone, so sharing one would make web and mobile spend one count.
    const [limiter, route] = input.enforceCaptcha
      ? [this.deps.registerRateLimiter, 'register']
      : [this.deps.registerWithoutCaptchaRateLimiter, 'register-without-captcha'];
    const emailAllowed = await limiter.consume(`${route}:email:${input.email.toLowerCase()}`);
    const ipAllowed = input.ipAddress
      ? await limiter.consume(`${route}:ip:${input.ipAddress}`)
      : true;
    if (!emailAllowed || !ipAllowed) {
      throw new RateLimitedError('Too many sign-up attempts. Try again later.');
    }
  }
}
