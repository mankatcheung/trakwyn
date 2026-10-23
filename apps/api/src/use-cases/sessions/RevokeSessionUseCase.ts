import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  sessionRepository: ISessionRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  transactionManager?: ITransactionManager;
}

export class RevokeSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    sessionId: string,
    userId: string,
    ipAddress: string | null = null,
    userAgent: string | null = null,
  ): Promise<void> {
    const session = await this.deps.sessionRepository.findByIdAndUserId(sessionId, userId);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.sessionRepository.revoke(sessionId);

      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId,
        eventType: 'session_revoked',
        ipAddress,
        userAgent,
      });
    });
  }
}
