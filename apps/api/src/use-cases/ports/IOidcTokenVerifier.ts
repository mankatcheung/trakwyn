/** The caller an OIDC ID token was verified to belong to. */
export interface VerifiedOidcIdentity {
  email: string;
}

/**
 * Verifies an OIDC ID token — signature, issuer, expiry and audience — and
 * reports whose it is. Used by the admin cron routes, which Cloud Scheduler
 * calls with a Google-signed token rather than a shared secret (JEF-336).
 *
 * Resolves `null` for any token that does not verify, including when the
 * signing keys cannot be fetched: the caller's only decision is whether to
 * let the request through, and an unverifiable token is a "no".
 */
export interface IOidcTokenVerifier {
  verify(token: string, audience: string): Promise<VerifiedOidcIdentity | null>;
}
