import { beforeAll, describe, expect, it } from 'vitest';
import { GoogleOidcTokenVerifier } from '#src/infrastructure/auth/GoogleOidcTokenVerifier.js';
import { createOidcTestKeys, type OidcTestKeys } from '../../helpers/oidcTokens.js';

const AUDIENCE = 'https://api.example.com';
const INVOKER = 'cron-invoker@project.iam.gserviceaccount.com';

describe('GoogleOidcTokenVerifier', () => {
  let google: OidcTestKeys;
  let verifier: GoogleOidcTokenVerifier;

  beforeAll(async () => {
    google = await createOidcTestKeys();
    verifier = new GoogleOidcTokenVerifier({ keys: google.keys });
  });

  it('returns the email of a valid token', async () => {
    const token = await google.sign(INVOKER, AUDIENCE);

    await expect(verifier.verify(token, AUDIENCE)).resolves.toEqual({ email: INVOKER });
  });

  it('accepts the issuer without a scheme, which Google also uses', async () => {
    const token = await google.sign(INVOKER, AUDIENCE, { issuer: 'accounts.google.com' });

    await expect(verifier.verify(token, AUDIENCE)).resolves.toEqual({ email: INVOKER });
  });

  it('refuses a token minted for a different audience', async () => {
    const token = await google.sign(INVOKER, 'https://other.example.com');

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    const token = await google.sign(INVOKER, AUDIENCE, {
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    });

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses a token from another issuer', async () => {
    const token = await google.sign(INVOKER, AUDIENCE, { issuer: 'https://evil.example.com' });

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses a token signed by a key outside the key set', async () => {
    const impostor = await createOidcTestKeys();
    const token = await impostor.sign(INVOKER, AUDIENCE);

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses a token whose email is not verified', async () => {
    const token = await google.sign(INVOKER, AUDIENCE, { claims: { email_verified: false } });

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses a token with no email claim', async () => {
    const token = await google.sign(INVOKER, AUDIENCE, { claims: { email: undefined } });

    await expect(verifier.verify(token, AUDIENCE)).resolves.toBeNull();
  });

  it('refuses something that is not a JWT at all', async () => {
    await expect(verifier.verify('a-shared-secret', AUDIENCE)).resolves.toBeNull();
  });
});
