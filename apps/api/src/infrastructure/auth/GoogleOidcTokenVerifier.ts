import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type {
  IOidcTokenVerifier,
  VerifiedOidcIdentity,
} from '#src/use-cases/ports/IOidcTokenVerifier.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import { GOOGLE_OIDC } from '#src/infrastructure/config/constants.js';

export interface GoogleOidcTokenVerifierOptions {
  /** Signing keys. Defaults to Google's published JWKS; tests pass a local set. */
  keys?: JWTVerifyGetKey;
  logger?: ILogger;
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
  private readonly logger?: ILogger;

  constructor(options: GoogleOidcTokenVerifierOptions = {}) {
    this.keys = options.keys ?? createRemoteJWKSet(new URL(GOOGLE_OIDC.JWKS_URL));
    this.logger = options.logger;
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
    } catch (err) {
      // Every failure still means "refuse" — the port has no other answer.
      // But a key fetch that failed says nothing about the token, and would
      // otherwise look exactly like a forged one (JEF-356), so it is logged.
      // Invalid tokens stay silent here; the cron route reports those.
      if (isKeyFetchFailure(err)) {
        this.logger?.error('Could not fetch Google signing keys', err, {
          event: GOOGLE_OIDC.JWKS_UNAVAILABLE_EVENT,
        });
      }
      return null;
    }
  }
}

/**
 * Whether `jwtVerify` failed while getting the keys rather than while judging
 * the token. jose's remote key set reports a fetch problem as `JWKSTimeout`,
 * `JWKSInvalid` (the response was not a key set), a bare `JOSEError` (non-200
 * or unparseable body), or the underlying network error, which is not a
 * `JOSEError` at all. Every verdict on the token itself is a `JOSEError`
 * subclass — malformed, bad signature, expired, wrong claims, no matching key.
 */
function isKeyFetchFailure(err: unknown): boolean {
  if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) return true;
  if (!(err instanceof errors.JOSEError)) return true;
  return err.code === errors.JOSEError.code;
}
