import { createHash } from 'node:crypto';
import { MCP_OAUTH } from '#src/use-cases/constants.js';
import type { McpOAuthScope } from '#src/domain/mcpOAuth/McpOAuthAccessToken.js';
import type { IMcpOAuthTokenRepository } from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';

interface Deps {
  mcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  now: () => Date;
}

export interface ValidateMcpOAuthAccessTokenResult {
  /** The access token's own id, which MCP keys its call budget on (JEF-465). */
  tokenId: string;
  sub: string;
  scope: McpOAuthScope;
}

export class ValidateMcpOAuthAccessTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(rawToken: string): Promise<ValidateMcpOAuthAccessTokenResult | null> {
    if (!rawToken.startsWith(MCP_OAUTH.ACCESS_TOKEN_PREFIX)) return null;

    const token = await this.deps.mcpOAuthTokenRepository.findByTokenHash(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    if (!token || token.audience !== MCP_OAUTH.RESOURCE || token.revokedAt) return null;

    if (token.expiresAt.getTime() <= this.deps.now().getTime()) return null;

    await this.deps.mcpOAuthTokenRepository.updateLastUsed(token.id);
    return { tokenId: token.id, sub: token.userId, scope: token.scope };
  }
}
