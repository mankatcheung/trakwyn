import { UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import { createHash } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
import type {
  IVerifyEmailUseCase,
  VerifyEmailInput,
} from '#src/use-cases/auth/IVerifyEmailUseCase.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  userRepository: IUserRepository;
  emailVerificationTokenRepository: IEmailVerificationTokenRepository;
  transactionManager?: ITransactionManager;
}

export class VerifyEmailUseCase implements IVerifyEmailUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const verificationToken =
      await this.deps.emailVerificationTokenRepository.findByTokenHash(tokenHash);

    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedError('Invalid or expired verification link');
    }

    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(verificationToken.userId, {
        emailVerifiedAt: new Date(),
      });
      await this.deps.emailVerificationTokenRepository.markUsed(verificationToken.id);
    });
  }
}
