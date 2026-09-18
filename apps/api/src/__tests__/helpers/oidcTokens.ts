import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export const TEST_OIDC_KID = 'test-key';
export const TEST_OIDC_ISSUER = 'https://accounts.google.com';

export interface OidcTokenOverrides {
  claims?: JWTPayload;
  audience?: string;
  issuer?: string;
  /** Seconds since the epoch; defaults to an hour from now. */
  expiresAt?: number;
}

export interface OidcTestKeys {
  /** Pass to `GoogleOidcTokenVerifier` in place of Google's remote JWKS. */
  keys: JWTVerifyGetKey;
  /** Mints a token shaped like the ones Cloud Scheduler sends. */
  sign(email: string, audience: string, overrides?: OidcTokenOverrides): Promise<string>;
}

/**
 * A local RS256 key pair standing in for Google's, so tests can mint ID
 * tokens the real verifier checks end to end without any network call.
 */
export async function createOidcTestKeys(): Promise<OidcTestKeys> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: TEST_OIDC_KID, alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });

  const sign = (email: string, audience: string, overrides: OidcTokenOverrides = {}) => {
    const nowS = Math.floor(Date.now() / 1000);
    return new SignJWT({ email, email_verified: true, ...overrides.claims })
      .setProtectedHeader({ alg: 'RS256', kid: TEST_OIDC_KID })
      .setIssuer(overrides.issuer ?? TEST_OIDC_ISSUER)
      .setAudience(overrides.audience ?? audience)
      .setSubject('1234567890')
      .setIssuedAt(nowS - 60)
      .setExpirationTime(overrides.expiresAt ?? nowS + 3600)
      .sign(privateKey);
  };

  return { keys, sign };
}
