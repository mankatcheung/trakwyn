import { createHash, timingSafeEqual } from 'node:crypto';
import { MCP_OAUTH } from '#src/use-cases/constants.js';
import type { CreateMcpOAuthAccessTokenUseCase } from './CreateMcpOAuthAccessTokenUseCase.js';
import type { CreateMcpOAuthRefreshTokenUseCase } from './CreateMcpOAuthRefreshTokenUseCase.js';
import type { McpOAuthAccessToken } from '#src/domain/mcpOAuth/McpOAuthAccessToken.js';
import type { IMcpOAuthAuthorizationCodeRepository } from '#src/use-cases/ports/IMcpOAuthAuthorizationCodeRepository.js';
import type { IMcpOAuthClientRepository } from '#src/use-cases/ports/IMcpOAuthClientRepository.js';
import type { IMcpOAuthRefreshTokenRepository } from '#src/use-cases/ports/IMcpOAuthRefreshTokenRepository.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ISecurityEventRepository } from '#src/use-cases/ports/ISecurityEventRepository.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';
import { runInTransaction } from '#src/use-cases/runInTransaction.js';

interface Deps {
  mcpOAuthAuthorizationCodeRepository: IMcpOAuthAuthorizationCodeRepository;
  mcpOAuthClientRepository: IMcpOAuthClientRepository;
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  mcpOAuthRefreshTokenRepository: IMcpOAuthRefreshTokenRepository;
  createMcpOAuthAccessTokenUseCase: Pick<CreateMcpOAuthAccessTokenUseCase, 'execute'>;
  createMcpOAuthRefreshTokenUseCase: Pick<CreateMcpOAuthRefreshTokenUseCase, 'execute'>;
  securityEventRepository: ISecurityEventRepository;
  generateId: () => string;
  now: () => Date;
  transactionManager?: ITransactionManager;
}

export interface ExchangeMcpOAuthAuthorizationCodeInput {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface ExchangeMcpOAuthAuthorizationCodeOutput {
  accessToken: string;
  refreshToken: string;
  token: McpOAuthAccessToken;
}

export class ExchangeMcpOAuthAuthorizationCodeUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: ExchangeMcpOAuthAuthorizationCodeInput,
  ): Promise<ExchangeMcpOAuthAuthorizationCodeOutput | null> {
    if (!input.code.startsWith(MCP_OAUTH.AUTHORIZATION_CODE_PREFIX)) return null;
    if (!isWellFormedVerifier(input.codeVerifier)) return null;

    const client = await this.deps.mcpOAuthClientRepository.findById(input.clientId);
    if (!client || client.revokedAt || !client.redirectUris.includes(input.redirectUri))
      return null;

    const code = await this.deps.mcpOAuthAuthorizationCodeRepository.findByCodeHash(
      createHash('sha256').update(input.code).digest('hex'),
    );
    if (!code || code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) {
      return null;
    }

    // A second presentation of a code that already worked means the code leaked:
    // whoever holds it raced the legitimate client, or picked it up afterwards.
    // Refusing the exchange is not enough — the tokens the *first* exchange
    // produced may be the attacker's. Kill the whole grant (OAuth 2.1 s4.1.3),
    // mirroring what refresh-token reuse detection already does.
    if (code.consumedAt) {
      await this.revokeGrant(code.familyId, code.userId);
      return null;
    }
    if (code.expiresAt.getTime() <= this.deps.now().getTime()) return null;
    if (
      code.codeChallengeMethod !== 'S256' ||
      !matchesPkce(input.codeVerifier, code.codeChallenge)
    ) {
      return null;
    }

    // Consumption is a conditional UPDATE, so two concurrent exchanges cannot
    // both win. The loser lands here rather than in the branch above.
    //
    // Consume and issue share one transaction so a failure while minting the
    // tokens gives the code back rather than burning it with nothing issued.
    // Losing the race is a *return value*, not a throw: revokeGrant must commit,
    // and a throw out of the transaction would roll it back.
    const issued = await runInTransaction(this.deps.transactionManager, async () => {
      const consumed = await this.deps.mcpOAuthAuthorizationCodeRepository.consume(
        code.id,
        this.deps.now(),
      );
      if (!consumed) return null;

      const token = await this.deps.createMcpOAuthAccessTokenUseCase.execute({
        userId: code.userId,
        clientId: code.clientId,
        familyId: code.familyId,
        scope: code.scope,
      });
      const refreshToken = await this.deps.createMcpOAuthRefreshTokenUseCase.execute({
        userId: code.userId,
        clientId: code.clientId,
        familyId: code.familyId,
        scope: code.scope,
      });
      return {
        accessToken: token.rawToken,
        refreshToken: refreshToken.rawToken,
        token: token.token,
      };
    });
    if (!issued) {
      await this.revokeGrant(code.familyId, code.userId);
      return null;
    }
    return issued;
  }

  private async revokeGrant(familyId: string, userId: string): Promise<void> {
    const now = this.deps.now();
    await this.deps.mcpOAuthTokenRepository.revokeFamily(familyId, now);
    await this.deps.mcpOAuthRefreshTokenRepository.revokeFamily(familyId, now);
    await this.deps.securityEventRepository.create({
      id: this.deps.generateId(),
      userId,
      eventType: 'mcp_oauth_code_reuse_detected',
      ipAddress: null,
      userAgent: null,
    });
  }
}

/**
 * RFC 7636 s4.1: 43-128 characters from the unreserved set. Rejecting a
 * malformed verifier up front keeps a client from silently weakening PKCE to
 * a handful of guessable bytes.
 */
function isWellFormedVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

function matchesPkce(verifier: string, expectedChallenge: string): boolean {
  const actual = createHash('sha256').update(verifier).digest('base64url');
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedChallenge);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
