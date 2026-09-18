import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type {
  IOidcTokenVerifier,
  VerifiedOidcIdentity,
} from '#src/use-cases/ports/IOidcTokenVerifier.js';
import { GOOGLE_OIDC } from '#src/infrastructure/config/constants.js';

export interface GoogleOidcTokenVerifierOptions {
  /** Signing keys. Defaults to Google's published JWKS; tests pass a local set. */
  keys?: JWTVerifyGetKey;
}

/**
 * Verifies Google-signed OIDC ID tokens, such as those Cloud Scheduler
 * attaches with `http_target.oidc_token` (infra/gcp/scheduler.tf).
 *
 * The remote key set is fetched lazily and cached by `jose`, which also
 * refetches when a token names a key it has not seen — so Google's key
 * rotation needs nothing from us.
 */
export class GoogleOidcTokenVerifier implements IOidcTokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(options: GoogleOidcTokenVerifierOptions = {}) {
    this.keys = options.keys ?? createRemoteJWKSet(new URL(GOOGLE_OIDC.JWKS_URL));
  }

  async verify(token: string, audience: string): Promise<VerifiedOidcIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: [...GOOGLE_OIDC.ISSUERS],
        audience,
        algorithms: [...GOOGLE_OIDC.ALGORITHMS],
      });
      // An unverified email is only a claim; the invoker check keys on it.
      if (typeof payload.email !== 'string' || payload.email_verified !== true) return null;
      return { email: payload.email };
    } catch {
      // jose throws for every failure mode (malformed, bad signature,
      // expired, wrong issuer/audience, key fetch failed); all mean "refuse".
      return null;
    }
  }
}
