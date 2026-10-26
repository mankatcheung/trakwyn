import { createHash } from 'crypto';
import type { IApiTokenRepository } from '#src/use-cases/ports/IApiTokenRepository.js';
import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import type { PlanFeature } from '#src/domain/plan/Plan.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';

interface Deps {
  apiTokenRepository: IApiTokenRepository;
  entitlementService: IEntitlementService;
}

export interface ValidateApiTokenResult {
  sub: string;
  email: string;
  scope: ApiTokenScope;
}

/** Where a token is being presented: the GraphQL API, or the MCP endpoint. */
export type ApiTokenSurface = 'graphql' | 'mcp';

/** The plan feature each surface needs. MCP is on for every plan; the rest of the API is Pro. */
const SURFACE_FEATURE = {
  graphql: 'apiAccess',
  mcp: 'mcpAccess',
} as const satisfies Record<ApiTokenSurface, PlanFeature>;

export class ValidateApiTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    rawToken: string,
    surface: ApiTokenSurface,
  ): Promise<ValidateApiTokenResult | null> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const result = await this.deps.apiTokenRepository.findByTokenHash(tokenHash);
    if (!result) return null;

    // A token works on a surface only when its owner's plan includes it: MCP
    // for everyone, the GraphQL API for Pro. A token is not deleted when its
    // owner drops to Free, only refused on the Pro surface, so it works there
    // again if they upgrade.
    const { features } = await this.deps.entitlementService.forUserId(result.token.userId);
    if (!features[SURFACE_FEATURE[surface]]) return null;

    await this.deps.apiTokenRepository.updateLastUsed(result.token.id);

    return { sub: result.token.userId, email: result.userEmail, scope: result.token.scope };
  }
}
