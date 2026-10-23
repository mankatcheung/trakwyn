import {
  NotFoundError,
  RateLimitedError,
  StepUpRequiredError,
  UnauthorizedError,
} from '#src/use-cases/errors/DomainError.js';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import { assertValidPassword } from '#src/use-cases/auth/passwordValidation.js';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';
import { isSessionFresh } from '#src/use-cases/auth/sessionFreshness.js';
import type {
  IUpdatePasswordUseCase,
  UpdatePasswordInput,
} from '#src/use-cases/user/IUpdatePasswordUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  updatePasswordRateLimiter: IRateLimiter;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class UpdatePasswordUseCase implements IUpdatePasswordUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: UpdatePasswordInput): Promise<void> {
    assertValidPassword(input.newPassword);

    // Rate-limit by user ID to prevent brute-force attacks on password changes
    const allowed = await this.deps.updatePasswordRateLimiter.consume(
      `update-password:user:${input.userId}`,
    );
    if (!allowed) {
      throw new RateLimitedError('Too many password update requests. Try again later.');
    }

    const user = await this.deps.userRepository.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    assertHasPassword(user.passwordHash);

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Invalid password');

    if (user.totpEnabled && !isSessionFresh(input.authTime)) {
      throw new StepUpRequiredError('Please verify your identity again to continue.');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(input.userId, { passwordHash });

      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId: input.userId,
        eventType: 'password_changed',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    });
  }
}
