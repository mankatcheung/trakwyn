import type { IMcpOAuthGrantRepository } from '#src/use-cases/ports/IMcpOAuthGrantRepository.js';
import type { IMcpOAuthRefreshTokenRepository } from '#src/use-cases/ports/IMcpOAuthRefreshTokenRepository.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  transactionManager?: ITransactionManager;
  mcpOAuthGrantRepository: IMcpOAuthGrantRepository;
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  mcpOAuthRefreshTokenRepository: IMcpOAuthRefreshTokenRepository;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  now: () => Date;
}

/**
 * Revocation initiated by the user rather than by the client — "I don't want
 * this thing reading my applications any more".
 *
 * Distinct from RevokeMcpOAuthGrantUseCase, which is the RFC 7009 endpoint and
 * authenticates by possession of the token. Here the caller holds a session,
 * not a token, so ownership has to be established explicitly: a grant id is a
 * plain identifier and nothing about receiving one proves it belongs to the
 * user asking. Revoking is otherwise identical — grant-wide, both token
 * families — so a client cannot refresh its way back in.
 *
 * Returns false for a grant that is not this user's, or is already gone,
 * without distinguishing between the two.
 */
export class RevokeMcpOAuthGrantForUserUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, grantId: string): Promise<boolean> {
    const now = this.deps.now();
    const grants = await this.deps.mcpOAuthGrantRepository.findActiveByUserId(userId, now);
    if (!grants.some((grant) => grant.id === grantId)) return false;

    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.mcpOAuthTokenRepository.revokeFamily(grantId, now);
      await this.deps.mcpOAuthRefreshTokenRepository.revokeFamily(grantId, now);
      await this.deps.securityEventRepository.create({
        id: this.deps.generateId(),
        userId,
        // Deliberately the same event type the client-initiated path records:
        // the audit trail is about the grant ending, not about who ended it.
        eventType: 'mcp_oauth_token_revoked',
        ipAddress: null,
        userAgent: null,
      });
    });
    return true;
  }
}
