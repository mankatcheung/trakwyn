import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRemoteJWKSet, errors, type JWTVerifyGetKey } from 'jose';
import { GoogleOidcTokenVerifier } from '#src/infrastructure/auth/GoogleOidcTokenVerifier.js';
import { GOOGLE_OIDC } from '#src/infrastructure/config/constants.js';
import { createOidcTestKeys, type OidcTestKeys } from '../../helpers/oidcTokens.js';
import { makeLogger } from '../../helpers/mocks/infrastructure.js';

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

  describe('key fetch failures (JEF-356)', () => {
    const failingWith =
      (err: unknown): JWTVerifyGetKey =>
      () =>
        Promise.reject(err);

    async function verifyWith(keys: JWTVerifyGetKey) {
      const logger = makeLogger();
      const token = await google.sign(INVOKER, AUDIENCE);
      const result = await new GoogleOidcTokenVerifier({ keys, logger }).verify(token, AUDIENCE);
      return { result, logger };
    }

    it.each([
      ['a network error', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })],
      ['a JWKS timeout', new errors.JWKSTimeout()],
      ['a response that is not a key set', new errors.JWKSInvalid()],
      [
        'a non-200 response',
        new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response'),
      ],
    ])('refuses and logs jwks_unavailable on %s', async (_label, err) => {
      const { result, logger } = await verifyWith(failingWith(err));

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Could not fetch Google signing keys', err, {
        event: GOOGLE_OIDC.JWKS_UNAVAILABLE_EVENT,
      });
    });

    it.each([
      ['a bad signature', new errors.JWSSignatureVerificationFailed()],
      ['no matching key', new errors.JWKSNoMatchingKey()],
    ])('stays silent when the key getter reports %s', async (_label, err) => {
      const { result, logger } = await verifyWith(failingWith(err));

      expect(result).toBeNull();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('stays silent for every kind of invalid token', async () => {
      const logger = makeLogger();
      const quiet = new GoogleOidcTokenVerifier({ keys: google.keys, logger });
      const impostor = await createOidcTestKeys();

      await quiet.verify('a-shared-secret', AUDIENCE);
      await quiet.verify(await impostor.sign(INVOKER, AUDIENCE), AUDIENCE);
      await quiet.verify(await google.sign(INVOKER, 'https://other.example.com'), AUDIENCE);
      await quiet.verify(
        await google.sign(INVOKER, AUDIENCE, { expiresAt: Math.floor(Date.now() / 1000) - 3600 }),
        AUDIENCE,
      );

      expect(logger.error).not.toHaveBeenCalled();
    });

    describe("with jose's real remote key set", () => {
      let server: Server;
      let serverUrl: URL;

      beforeAll(async () => {
        server = createServer((_req, res) => {
          res.statusCode = 500;
          res.end('upstream down');
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        serverUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/certs`);
      });

      afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
      });

      it('logs when the endpoint answers with an error status', async () => {
        const { result, logger } = await verifyWith(createRemoteJWKSet(serverUrl));

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), {
          event: GOOGLE_OIDC.JWKS_UNAVAILABLE_EVENT,
        });
      });

      it('logs when nothing is listening', async () => {
        const closed = new URL('http://127.0.0.1:1/certs');
        const { result, logger } = await verifyWith(createRemoteJWKSet(closed));

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), {
          event: GOOGLE_OIDC.JWKS_UNAVAILABLE_EVENT,
        });
      });
    });
  });
});
