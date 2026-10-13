import { ConflictError, RateLimitedError } from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
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
  registerRateLimiter: IRateLimiter;
}

export class RegisterUseCase implements IRegisterUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    // Before the password hash and the lookup: a rejected sign-up costs nothing.
    if (
      input.ipAddress &&
      !(await this.deps.registerRateLimiter.consume(`register:ip:${input.ipAddress}`))
    ) {
      throw new RateLimitedError('Too many sign-up attempts. Try again later.');
    }

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
}
