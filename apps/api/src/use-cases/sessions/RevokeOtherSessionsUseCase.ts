import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  transactionManager?: ITransactionManager;
  sessionRepository: ISessionRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
}

export class RevokeOtherSessionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    userId: string,
    currentSessionId: string,
    ipAddress: string | null = null,
    userAgent: string | null = null,
  ): Promise<void> {
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.sessionRepository.revokeAllForUserExcept(userId, currentSessionId);
      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId,
        eventType: 'other_sessions_revoked',
        ipAddress,
        userAgent,
      });
    });
  }
}
