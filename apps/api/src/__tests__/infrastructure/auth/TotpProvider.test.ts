import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ENV, PLACEHOLDER_SECRET } from '#src/infrastructure/config/constants.js';
import { TotpProvider } from '#src/infrastructure/auth/TotpProvider.js';

describe('TotpProvider', () => {
  const originalKey = process.env[ENV.TOTP_ENCRYPTION_KEY];
  const provider = new TotpProvider();

  beforeEach(() => {
    process.env[ENV.TOTP_ENCRYPTION_KEY] = 'test-encryption-key-not-for-production';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env[ENV.TOTP_ENCRYPTION_KEY];
    } else {
      process.env[ENV.TOTP_ENCRYPTION_KEY] = originalKey;
    }
  });

  describe('generateSecret', () => {
    it('returns a base32 secret', () => {
      expect(provider.generateSecret()).toMatch(/^[A-Z2-7]+$/);
    });

    it('returns a different secret on each call', () => {
      expect(provider.generateSecret()).not.toBe(provider.generateSecret());
    });
  });

  describe('getOtpauthUrl', () => {
    it('builds an otpauth:// URI containing the label', () => {
      const secret = provider.generateSecret();
      const url = provider.getOtpauthUrl(secret, 'user@example.com');

      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain(encodeURIComponent('user@example.com'));
    });
  });

  describe('verifyCode', () => {
    it('rejects an invalid code', async () => {
      const secret = provider.generateSecret();
      await expect(provider.verifyCode(secret, '000000')).resolves.toBe(false);
    });
  });

  describe('encryptSecret / decryptSecret', () => {
    it('decrypts back to the original plaintext', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      const encrypted = provider.encryptSecret(secret);
      const decrypted = provider.decryptSecret(encrypted);

      expect(decrypted).toBe(secret);
    });

    it('does not store the plaintext secret in the ciphertext', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      const encrypted = provider.encryptSecret(secret);

      expect(encrypted).not.toContain(secret);
    });

    it('produces different ciphertext for the same plaintext on each call (random IV)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';

      const first = provider.encryptSecret(secret);
      const second = provider.encryptSecret(secret);

      expect(first).not.toBe(second);
      expect(provider.decryptSecret(first)).toBe(secret);
      expect(provider.decryptSecret(second)).toBe(secret);
    });

    it('throws when the ciphertext has been tampered with', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = provider.encryptSecret(secret);
      const tamperedBytes = Buffer.from(encrypted, 'base64');
      tamperedBytes[tamperedBytes.length - 1] ^= 0xff;
      const tampered = tamperedBytes.toString('base64');

      expect(() => provider.decryptSecret(tampered)).toThrow();
    });

    it('throws a clear error when TOTP_ENCRYPTION_KEY is not configured', () => {
      delete process.env[ENV.TOTP_ENCRYPTION_KEY];

      expect(() => provider.encryptSecret('JBSWY3DPEHPK3PXP')).toThrow(/TOTP_ENCRYPTION_KEY/);
    });
  });

  describe('passphrase guard (F5)', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('refuses the .env.example placeholder in production', () => {
      process.env[ENV.TOTP_ENCRYPTION_KEY] = PLACEHOLDER_SECRET;
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => new TotpProvider().encryptSecret('JBSWY3DPEHPK3PXP')).toThrow(/placeholder/);
    });

    it('tolerates the placeholder outside production', () => {
      process.env[ENV.TOTP_ENCRYPTION_KEY] = PLACEHOLDER_SECRET;
      vi.stubEnv('NODE_ENV', 'test');
      const fresh = new TotpProvider();

      expect(fresh.decryptSecret(fresh.encryptSecret('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
    });

    it('derives the scrypt key once per passphrase', () => {
      const fresh = new TotpProvider();
      fresh.encryptSecret('JBSWY3DPEHPK3PXP');
      const first = fresh['derived'];
      fresh.encryptSecret('JBSWY3DPEHPK3PXP');

      expect(fresh['derived']).toBe(first);
    });
  });
});
