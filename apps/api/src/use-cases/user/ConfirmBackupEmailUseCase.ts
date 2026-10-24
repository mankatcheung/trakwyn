import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import { createHash } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IBackupEmailVerificationTokenRepository } from '#src/use-cases/ports/IBackupEmailVerificationTokenRepository.js';
import type {
  IConfirmBackupEmailUseCase,
  ConfirmBackupEmailInput,
} from '#src/use-cases/user/IConfirmBackupEmailUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  backupEmailVerificationTokenRepository: IBackupEmailVerificationTokenRepository;
  transactionManager?: ITransactionManager;
}

export class ConfirmBackupEmailUseCase implements IConfirmBackupEmailUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConfirmBackupEmailInput): Promise<void> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const verificationToken =
      await this.deps.backupEmailVerificationTokenRepository.findByTokenHash(tokenHash);

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedError('Invalid or expired confirmation link');
    }

    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(verificationToken.userId, {
        backupEmail: verificationToken.newBackupEmail,
        backupEmailVerifiedAt: new Date(),
      });

      await this.deps.backupEmailVerificationTokenRepository.markUsed(verificationToken.id);
      await this.deps.backupEmailVerificationTokenRepository.deleteAllForUser(
        verificationToken.userId,
      );
    });
  }
}
