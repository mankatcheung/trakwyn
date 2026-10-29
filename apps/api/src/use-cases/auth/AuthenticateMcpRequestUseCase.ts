import { API_TOKEN, MCP_OAUTH } from '#src/use-cases/constants.js';
import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { ValidateApiTokenUseCase } from '#src/use-cases/apiTokens/ValidateApiTokenUseCase.js';
import type { ValidateMcpOAuthAccessTokenUseCase } from '#src/use-cases/mcpOAuth/ValidateMcpOAuthAccessTokenUseCase.js';

const MCP_TOKEN_KIND = { API: 'api', OAUTH: 'oauth' } as const;

export interface AuthenticateMcpRequestResult {
  /**
   * The credential's id, prefixed by its kind so an API token and an OAuth
   * access token never share a rate-limit bucket (JEF-465).
   */
  tokenId: string;
  sub: string;
  /**
   * The token's scope, carried through so the caller can gate write tools
   * (JEF-176). Both scopes reach MCP — that's what lets a read-only token be
   * useful here — so "authenticated" is not the same as "may mutate".
   *
   * OAuth access tokens carry the scope the user consented to on the consent
   * screen, and it lands in this same field: consenting to `read` must buy
   * exactly what a read-only API token buys, no more. `McpOAuthScope` and
   * `ApiTokenScope` are the same union today, so the assignment below is a
   * compile-time check that they stay that way — if either gains a member,
   * this stops building rather than silently widening what a grant permits.
   */
  scope: ApiTokenScope;
  /** Which credential this was, for attributing its writes (JEF-466). */
  actor: McpActor;
}

interface Deps {
  entitlementService: IEntitlementService;
  validateApiTokenUseCase: ValidateApiTokenUseCase;
  validateMcpOAuthAccessTokenUseCase?: ValidateMcpOAuthAccessTokenUseCase;
}

/**
 * Authenticates an MCP request's Bearer credential — either a manually-created
 * API token (`trakwyn_...`) or an OAuth access token (`trakwyn_mcp_...`).
 *
 * Accepts any scope (FULL or READ) — unlike GraphQL which requires FULL —
 * and returns it, so write tools can be refused to READ credentials.
 * Rejects JWTs and any other non-token credentials.
 * Returns null for invalid, expired, or unrecognised credentials.
 */
export class AuthenticateMcpRequestUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(rawToken: string): Promise<AuthenticateMcpRequestResult | null> {
    // Checked first: ACCESS_TOKEN_PREFIX (`trakwyn_mcp_`) extends API_TOKEN.PREFIX
    // (`trakwyn_`), so testing the API-token prefix first would swallow every
    // OAuth token and hand it to the wrong validator.
    if (rawToken.startsWith(MCP_OAUTH.ACCESS_TOKEN_PREFIX)) {
      if (!this.deps.validateMcpOAuthAccessTokenUseCase) return null;
      try {
        const result = await this.deps.validateMcpOAuthAccessTokenUseCase.execute(rawToken);
        if (!result) return null;
        // MCP access is on for every plan today (JEF-442), but it is still a
        // feature, so a plan that drops it stops working here. (A manually
        // created API token is checked the same way inside
        // `ValidateApiTokenUseCase`.)
        const { features } = await this.deps.entitlementService.forUserId(result.sub);
        return features.mcpAccess
          ? {
              tokenId: `${MCP_TOKEN_KIND.OAUTH}:${result.tokenId}`,
              sub: result.sub,
              scope: result.scope,
              actor: { source: 'mcp', apiTokenId: result.grantId, apiTokenName: result.clientName },
            }
          : null;
      } catch {
        return null;
      }
    }

    if (!rawToken.startsWith(API_TOKEN.PREFIX)) return null;

    try {
      const result = await this.deps.validateApiTokenUseCase.execute(rawToken, 'mcp');
      return result
        ? {
            tokenId: `${MCP_TOKEN_KIND.API}:${result.tokenId}`,
            sub: result.sub,
            scope: result.scope,
            actor: { source: 'mcp', apiTokenId: result.tokenId, apiTokenName: result.tokenName },
          }
        : null;
    } catch {
      return null;
    }
  }
}
