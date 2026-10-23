import { ConflictError, UnauthorizedError } from '#src/use-cases/errors/DomainError.js';
import { createHash } from 'crypto';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IEmailVerificationTokenRepository } from '#src/use-cases/ports/IEmailVerificationTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';
import type {
  IConfirmEmailChangeUseCase,
  ConfirmEmailChangeInput,
} from '#src/use-cases/user/IConfirmEmailChangeUseCase.js';

interface Deps {
  userRepository: IUserRepository;
  emailVerificationTokenRepository: IEmailVerificationTokenRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class ConfirmEmailChangeUseCase implements IConfirmEmailChangeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConfirmEmailChangeInput): Promise<void> {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const verificationToken =
      await this.deps.emailVerificationTokenRepository.findByTokenHash(tokenHash);

    if (
      !verificationToken ||
      !verificationToken.newEmail ||
      verificationToken.usedAt ||
      verificationToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedError('Invalid or expired confirmation link');
    }

    // Guard against a race: someone else may have taken the new address
    // while this confirmation link was sitting unused.
    const existing = await this.deps.userRepository.findByEmail(verificationToken.newEmail);
    if (existing && existing.id !== verificationToken.userId) {
      throw new ConflictError('Email already in use');
    }

    const newEmail = verificationToken.newEmail;
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.userRepository.update(verificationToken.userId, {
        email: newEmail,
        emailVerifiedAt: new Date(),
      });
      await this.deps.emailVerificationTokenRepository.markUsed(verificationToken.id);

      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId: verificationToken.userId,
        eventType: 'email_changed',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    });
  }
}
