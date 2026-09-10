import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ENV, PLACEHOLDER_SECRET } from '#src/infrastructure/config/constants.js';
import { LlmApiKeyCipher } from '#src/infrastructure/llm/LlmApiKeyCipher.js';

describe('LlmApiKeyCipher', () => {
  const originalKey = process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY];
  const cipher = new LlmApiKeyCipher();

  beforeEach(() => {
    process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = 'test-encryption-key-not-for-production';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalKey === undefined) {
      delete process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY];
    } else {
      process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = originalKey;
    }
  });

  describe('encrypt / decrypt', () => {
    it('decrypts back to the original plaintext', () => {
      const apiKey = 'sk-or-v1-abc123';

      const encrypted = cipher.encrypt(apiKey);
      const decrypted = cipher.decrypt(encrypted);

      expect(decrypted).toBe(apiKey);
    });

    it('does not store the plaintext key in the ciphertext', () => {
      const apiKey = 'sk-or-v1-abc123';

      const encrypted = cipher.encrypt(apiKey);

      expect(encrypted).not.toContain(apiKey);
    });

    it('produces different ciphertext for the same plaintext on each call (random IV)', () => {
      const apiKey = 'sk-or-v1-abc123';

      const first = cipher.encrypt(apiKey);
      const second = cipher.encrypt(apiKey);

      expect(first).not.toBe(second);
      expect(cipher.decrypt(first)).toBe(apiKey);
      expect(cipher.decrypt(second)).toBe(apiKey);
    });

    it('marks new ciphertexts with a format version so the passphrase can be rotated later', () => {
      expect(cipher.encrypt('sk-1')).toMatch(/^v1:[A-Za-z0-9+/=]+$/);
    });

    it('throws when the ciphertext has been tampered with', () => {
      const apiKey = 'sk-or-v1-abc123';
      const encrypted = cipher.encrypt(apiKey);
      const [prefix, payload] = [encrypted.slice(0, 3), encrypted.slice(3)];
      const tamperedBytes = Buffer.from(payload, 'base64');
      tamperedBytes[tamperedBytes.length - 1] ^= 0xff;
      const tampered = prefix + tamperedBytes.toString('base64');

      expect(() => cipher.decrypt(tampered)).toThrow();
    });

    it('throws a clear error when LLM_API_KEY_ENCRYPTION_KEY is not configured', () => {
      delete process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY];

      expect(() => cipher.encrypt('sk-or-v1-abc123')).toThrow(/LLM_API_KEY_ENCRYPTION_KEY/);
    });
  });

  describe('row binding (AAD)', () => {
    it('decrypts with the context it was sealed under', () => {
      const encrypted = cipher.encrypt('sk-1', 'user-1:openai');

      expect(cipher.decrypt(encrypted, 'user-1:openai')).toBe('sk-1');
    });

    it('refuses a ciphertext moved to another row', () => {
      const encrypted = cipher.encrypt('sk-1', 'user-1:openai');

      expect(() => cipher.decrypt(encrypted, 'user-2:openai')).toThrow();
      expect(() => cipher.decrypt(encrypted)).toThrow();
    });

    it('still decrypts values sealed before the format existed, ignoring any context', () => {
      // Produced by the pre-`v1:` implementation with this passphrase; the
      // pinned-salt test keeps the same fixture alive for the same reason.
      process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = 'salt-pinning-test-passphrase';
      const legacy = '1e8uZytALIwIO+uow3pnq54S1L3u7xiARD1HzAPrhmag3Z90mE0LWfIhzdvQ7g==';

      expect(cipher.decrypt(legacy)).toBe('sk-test-0123456789');
      expect(cipher.decrypt(legacy, 'user-1:openai')).toBe('sk-test-0123456789');
    });
  });

  describe('key derivation', () => {
    it('derives the scrypt key once per passphrase rather than on every call', () => {
      const fresh = new LlmApiKeyCipher();
      fresh.encrypt('a');
      const first = fresh['derived'];
      fresh.encrypt('b');
      fresh.decrypt(fresh.encrypt('c'));

      expect(fresh['derived']).toBe(first);
    });

    it('re-derives when the passphrase changes', () => {
      const fresh = new LlmApiKeyCipher();
      fresh.encrypt('a');
      const first = fresh['derived'];
      process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = 'another-passphrase';
      fresh.encrypt('a');

      expect(fresh['derived']).not.toBe(first);
    });

    it('refuses the .env.example placeholder in production', () => {
      process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = PLACEHOLDER_SECRET;
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => new LlmApiKeyCipher().encrypt('sk-1')).toThrow(/placeholder/);
    });

    it('tolerates the placeholder outside production', () => {
      process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] = PLACEHOLDER_SECRET;
      vi.stubEnv('NODE_ENV', 'test');

      expect(new LlmApiKeyCipher().decrypt(new LlmApiKeyCipher().encrypt('sk-1'))).toBe('sk-1');
    });
  });
});
