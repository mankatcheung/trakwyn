import { API_TOKEN, API_TOKEN_SCOPE } from '#src/use-cases/constants.js';
import type { ITokenService } from '#src/use-cases/ports/ITokenService.js';
import type { ISessionBlocklist } from '#src/use-cases/ports/ISessionBlocklist.js';
import type { ValidateApiTokenUseCase } from '#src/use-cases/apiTokens/ValidateApiTokenUseCase.js';

export interface AuthenticateRequestResult {
  sub: string;
  email: string;
  sid?: string;
  /** Epoch-ms of the session's last full authentication — absent for API-token auth (no session/freshness concept). See `REAUTH` in constants.ts. */
  authTime?: number;
}

interface Deps {
  tokenService: ITokenService;
  validateApiTokenUseCase: ValidateApiTokenUseCase;
  sessionBlocklist: ISessionBlocklist;
}

/**
 * Authenticates a raw access token — either a JWT (cookie/Bearer from login)
 * or an API token (`trakwyn_...` Bearer for programmatic access).
 *
 * Only FULL-scoped API tokens are accepted; READ-scoped tokens are MCP-only.
 * Returns null for any invalid, expired, or insufficiently-scoped token.
 *
 * A valid JWT signature is necessary but not sufficient: its session may have
 * been revoked (logout, "sign out other sessions", password reset,
 * refresh-token reuse) since it was issued, so the `sid` is also checked
 * against the revocation blocklist (JEF-164).
 */
export class AuthenticateRequestUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(rawToken: string): Promise<AuthenticateRequestResult | null> {
    if (rawToken.startsWith(API_TOKEN.PREFIX)) {
      try {
        const result = await this.deps.validateApiTokenUseCase.execute(rawToken, 'graphql');
        if (result && result.scope === API_TOKEN_SCOPE.FULL) {
          return { sub: result.sub, email: result.email };
        }
        return null;
      } catch {
        return null;
      }
    }

    // JWT path
    let claims: AuthenticateRequestResult;
    try {
      claims = this.deps.tokenService.verifyAccess(rawToken);
    } catch {
      return null;
    }

    // Deliberately outside the try/catch above: the blocklist fails open
    // internally (a backing-store outage resolves to "not revoked"), so an
    // exception escaping here would be a genuine bug worth surfacing rather
    // than something to silently swallow as "invalid token".
    if (claims.sid && (await this.deps.sessionBlocklist.isRevoked(claims.sid))) {
      return null;
    }

    return claims;
  }
}
