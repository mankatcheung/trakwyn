import { UnauthorizedError, UserNotFoundError } from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ILoginEventRepository } from '#src/use-cases/ports/ILoginEventRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ILoginUseCase, LoginInput, LoginOutput } from '#src/use-cases/auth/ILoginUseCase.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { logAuthFailure } from '#src/use-cases/auth/logAuthFailure.js';
import { AUTH_FAILURE_EVENTS } from '#src/use-cases/constants.js';

interface Deps {
  userRepository: IUserRepository;
  loginEventRepository: ILoginEventRepository;
  generateId: () => string;
  logger: ILogger;
}

export class LoginUseCase implements ILoginUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.deps.userRepository.findByEmail(input.email);
    if (!user) {
      this.logFailure('invalid_credentials');
      throw new UserNotFoundError('No account found with this email. Please register first.');
    }
    if (user.passwordHash === null) this.logFailure('no_password');
    assertHasPassword(user.passwordHash);

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      this.logFailure('invalid_credentials');
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

  // `LoginEvent` records successes only, so a refusal is logged here or
  // nowhere (JEF-354).
  private logFailure(reason: 'invalid_credentials' | 'no_password'): void {
    logAuthFailure(this.deps.logger, AUTH_FAILURE_EVENTS.LOGIN_FAILED, reason);
  }
}
