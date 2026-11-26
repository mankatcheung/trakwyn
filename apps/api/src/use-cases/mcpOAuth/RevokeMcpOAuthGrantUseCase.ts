import { createHash } from 'node:crypto';
import { MCP_OAUTH } from '#src/use-cases/constants.js';
import type { IMcpOAuthRefreshTokenRepository } from '#src/use-cases/ports/IMcpOAuthRefreshTokenRepository.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  transactionManager?: ITransactionManager;
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  mcpOAuthRefreshTokenRepository: IMcpOAuthRefreshTokenRepository;
  now: () => Date;
}

/**
 * RFC 7009 token revocation.
 *
 * Accepts either credential type — a client holding only a refresh token must
 * be able to hand it back, and the endpoint answering 200 while quietly doing
 * nothing (because it only understood access tokens) is worse than an error:
 * the client believes it has disconnected while a 30-day refresh token stays
 * live.
 *
 * Revocation is always grant-wide, in both directions. RFC 7009 s2.1 only
 * *recommends* that revoking one kind takes the other with it; here it is
 * unconditional, because the user-visible meaning of revoking is "this client
 * loses access", and leaving either half alive does not deliver that.
 *
 * Returns the owning user id so the caller can record a security event, or
 * null if the credential is unknown — the endpoint responds 200 either way,
 * so an attacker cannot use it to probe which tokens exist.
 */
export class RevokeMcpOAuthGrantUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(rawToken: string): Promise<string | null> {
    const grant = await this.findGrant(rawToken);
    if (!grant) return null;

    const now = this.deps.now();
    await runInTransaction(this.deps.transactionManager, async () => {
      await this.deps.mcpOAuthTokenRepository.revokeFamily(grant.familyId, now);
      await this.deps.mcpOAuthRefreshTokenRepository.revokeFamily(grant.familyId, now);
    });
    return grant.userId;
  }

  private async findGrant(rawToken: string): Promise<{ familyId: string; userId: string } | null> {
    const hash = createHash('sha256').update(rawToken).digest('hex');

    // Order matters: ACCESS_TOKEN_PREFIX (`trakwyn_mcp_`) is a prefix of
    // REFRESH_TOKEN_PREFIX (`trakwyn_mcp_refresh_`), so the longer one is
    // tested first or every refresh token is misread as an access token.
    if (rawToken.startsWith(MCP_OAUTH.REFRESH_TOKEN_PREFIX)) {
      return this.deps.mcpOAuthRefreshTokenRepository.findByTokenHash(hash);
    }
    if (rawToken.startsWith(MCP_OAUTH.ACCESS_TOKEN_PREFIX)) {
      return this.deps.mcpOAuthTokenRepository.findByTokenHash(hash);
    }
    return null;
  }
}
