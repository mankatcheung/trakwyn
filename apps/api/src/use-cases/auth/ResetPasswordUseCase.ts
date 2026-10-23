import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IPasswordResetTokenRepository } from '#src/use-cases/ports/IPasswordResetTokenRepository.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import { assertValidPassword } from '#src/use-cases/auth/passwordValidation.js';
import type {
  IResetPasswordUseCase,
  ResetPasswordInput,
} from '#src/use-cases/auth/IResetPasswordUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  passwordResetTokenRepository: IPasswordResetTokenRepository;
  sessionRepository: ISessionRepository;
  transactionManager?: ITransactionManager;
}

export class ResetPasswordUseCase implements IResetPasswordUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    assertValidPassword(input.newPassword);

    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const resetToken = await this.deps.passwordResetTokenRepository.findByTokenHash(tokenHash);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired reset link');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    // One transaction: a failure after the password changes must not leave the
    // reset link reusable or the old sessions alive.
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(resetToken.userId, { passwordHash });
      await this.deps.passwordResetTokenRepository.markUsed(resetToken.id);
      // Invalidate every existing session so a refresh token stolen before the
      // reset can't survive it — otherwise the whole point of the reset is defeated.
      await this.deps.sessionRepository.revokeAllForUser(resetToken.userId);
    });
  }
}
