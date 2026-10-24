import { createHash } from 'node:crypto';
import { MCP_OAUTH } from '#src/use-cases/constants.js';
import type { CreateMcpOAuthAccessTokenUseCase } from './CreateMcpOAuthAccessTokenUseCase.js';
import type { CreateMcpOAuthRefreshTokenUseCase } from './CreateMcpOAuthRefreshTokenUseCase.js';
import type { IMcpOAuthClientRepository } from '#src/use-cases/ports/IMcpOAuthClientRepository.js';
import type { IMcpOAuthRefreshTokenRepository } from '#src/use-cases/ports/IMcpOAuthRefreshTokenRepository.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  mcpOAuthRefreshTokenRepository: IMcpOAuthRefreshTokenRepository;
  mcpOAuthClientRepository: IMcpOAuthClientRepository;
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  createMcpOAuthAccessTokenUseCase: Pick<CreateMcpOAuthAccessTokenUseCase, 'execute'>;
  createMcpOAuthRefreshTokenUseCase: Pick<CreateMcpOAuthRefreshTokenUseCase, 'execute'>;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  now: () => Date;
  transactionManager?: ITransactionManager;
}

export interface RotateMcpOAuthRefreshTokenInput {
  refreshToken: string;
  clientId: string;
}

export interface RotateMcpOAuthRefreshTokenOutput {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

export class RotateMcpOAuthRefreshTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: RotateMcpOAuthRefreshTokenInput,
  ): Promise<RotateMcpOAuthRefreshTokenOutput | null> {
    if (!input.refreshToken.startsWith(MCP_OAUTH.REFRESH_TOKEN_PREFIX)) return null;
    const token = await this.deps.mcpOAuthRefreshTokenRepository.findByTokenHash(
      createHash('sha256').update(input.refreshToken).digest('hex'),
    );
    if (!token || token.clientId !== input.clientId) return null;

    const now = this.deps.now();
    if (token.revokedAt || token.expiresAt.getTime() <= now.getTime()) return null;
    if (token.usedAt) {
      await this.burnFamily(token.familyId, token.userId, now);
      return null;
    }

    // markUsed and the replacement tokens commit together, so a failure while
    // minting them leaves the presented refresh token usable instead of spent.
    // Losing the markUsed race is a return value, not a throw: burnFamily must
    // commit, and a throw out of the transaction would roll it back.
    const rotated = await runInTransaction(this.deps.transactionManager, async () => {
      if (!(await this.deps.mcpOAuthRefreshTokenRepository.markUsed(token.id, now))) return null;

      const accessToken = await this.deps.createMcpOAuthAccessTokenUseCase.execute({
        userId: token.userId,
        clientId: token.clientId,
        familyId: token.familyId,
        scope: token.scope,
      });
      const refreshToken = await this.deps.createMcpOAuthRefreshTokenUseCase.execute({
        userId: token.userId,
        clientId: token.clientId,
        scope: token.scope,
        familyId: token.familyId,
      });
      return {
        userId: token.userId,
        accessToken: accessToken.rawToken,
        refreshToken: refreshToken.rawToken,
        accessTokenExpiresAt: accessToken.token.expiresAt,
      };
    });
    if (!rotated) {
      await this.burnFamily(token.familyId, token.userId, now);
      return null;
    }
    return rotated;
  }

  /**
   * Reuse means the family is compromised, so every credential descended from
   * that one consent goes — refresh tokens *and* the access tokens already
   * issued from them. Revoking only the refresh side would leave the attacker
   * a live access token for the rest of its hour.
   */
  private async burnFamily(familyId: string, userId: string, now: Date): Promise<void> {
    await this.deps.mcpOAuthRefreshTokenRepository.revokeFamily(familyId, now);
    await this.deps.mcpOAuthTokenRepository.revokeFamily(familyId, now);
    await this.recordReuse(userId);
  }

  private async recordReuse(userId: string): Promise<void> {
    await this.deps.securityEventRepository.create({
      id: this.deps.generateId(),
      userId,
      eventType: 'mcp_oauth_refresh_reuse_detected',
      ipAddress: null,
      userAgent: null,
    });
  }
}
