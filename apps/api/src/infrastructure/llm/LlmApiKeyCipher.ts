import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import { ENV, NODE_ENV, PLACEHOLDER_SECRET } from '#src/infrastructure/config/constants.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_LENGTH = 32;
/**
 * Key-derivation salt, NOT a label — do not rename it.
 *
 * It is an input to scryptSync below, so changing the string changes the
 * derived AES key and every value already encrypted with the old one stops
 * decrypting. The pre-rebrand name is deliberate dead weight: it is load-
 * bearing precisely because it is arbitrary.
 *
 * Renaming it makes every LLM API key users have saved unrecoverable.
 *
 * Rotating it would mean decrypting everything with the old salt and
 * re-encrypting with the new one, in a migration, before any deploy uses it.
 */
const SCRYPT_SALT = 'job-finder-llm-api-key';

/**
 * Ciphertext format marker. Values written before it existed are bare
 * base64 (`iv ‖ tag ‖ ciphertext`, no AAD) and still decrypt; `v1:` adds
 * the row-binding AAD. `:` is not in the base64 alphabet, so the prefix can
 * never collide with a legacy value. A future key rotation gets `v2:` and a
 * migration, rather than a flag day.
 */
const FORMAT_V1 = 'v1:';

export class LlmApiKeyCipher implements ILlmApiKeyCipher {
  /**
   * scrypt is deliberately slow (tens of milliseconds); deriving on every
   * call put that on the request path of every AI feature. Cached per
   * passphrase, so a changed env var is picked up rather than served stale.
   */
  private derived: { passphrase: string; key: Buffer } | null = null;

  private getKey(): Buffer {
    const passphrase = process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY];
    if (!passphrase) {
      throw new Error(
        `${ENV.LLM_API_KEY_ENCRYPTION_KEY} is not configured — required to encrypt/decrypt users' LLM API keys`,
      );
    }
    if (passphrase === PLACEHOLDER_SECRET && process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION) {
      throw new Error(
        `${ENV.LLM_API_KEY_ENCRYPTION_KEY} is still the .env.example placeholder — set a real passphrase before running in production`,
      );
    }
    if (this.derived?.passphrase !== passphrase) {
      this.derived = { passphrase, key: scryptSync(passphrase, SCRYPT_SALT, KEY_LENGTH) };
    }
    return this.derived.key;
  }

  encrypt(plaintext: string, context = ''): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return FORMAT_V1 + Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string, context = ''): string {
    const versioned = ciphertext.startsWith(FORMAT_V1);
    const data = Buffer.from(versioned ? ciphertext.slice(FORMAT_V1.length) : ciphertext, 'base64');
    const iv = data.subarray(0, IV_BYTES);
    const authTag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const encrypted = data.subarray(IV_BYTES + AUTH_TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.getKey(), iv);
    // Legacy values were sealed without AAD; supplying one now would fail
    // the tag check on every key saved before this format existed.
    if (versioned) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
