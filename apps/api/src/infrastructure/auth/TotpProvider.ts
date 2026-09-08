import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { ITotpProvider } from '#src/use-cases/ports/ITotpProvider.js';
import {
  ENV,
  TOTP_CONFIG,
  NODE_ENV,
  PLACEHOLDER_SECRET,
} from '#src/infrastructure/config/constants.js';

const crypto = new NobleCryptoPlugin();
const base32 = new ScureBase32Plugin();

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
 * Renaming it locks every user with 2FA enabled out of their account:
 * their stored TOTP secret no longer decrypts, so no code ever verifies.
 *
 * Rotating it would mean decrypting everything with the old salt and
 * re-encrypting with the new one, in a migration, before any deploy uses it.
 */
const SCRYPT_SALT = 'job-finder-totp-secret';

export class TotpProvider implements ITotpProvider {
  private makeTotp(options: { secret?: string; label?: string } = {}): TOTP {
    return new TOTP({ crypto, base32, issuer: TOTP_CONFIG.ISSUER, ...options });
  }

  /** Cached per passphrase — scrypt is deliberately slow (see LlmApiKeyCipher). */
  private derived: { passphrase: string; key: Buffer } | null = null;

  private getKey(): Buffer {
    const passphrase = process.env[ENV.TOTP_ENCRYPTION_KEY];
    if (!passphrase) {
      throw new Error(
        `${ENV.TOTP_ENCRYPTION_KEY} is not configured — required to encrypt/decrypt TOTP secrets`,
      );
    }
    // Same guard as the LLM key cipher (S7/F5): the .env.example value is a
    // string in a public repo, and every user's 2FA secret would be behind it.
    if (passphrase === PLACEHOLDER_SECRET && process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION) {
      throw new Error(
        `${ENV.TOTP_ENCRYPTION_KEY} is still the .env.example placeholder — set a real passphrase before running in production`,
      );
    }
    if (this.derived?.passphrase !== passphrase) {
      this.derived = { passphrase, key: scryptSync(passphrase, SCRYPT_SALT, KEY_LENGTH) };
    }
    return this.derived.key;
  }

  generateSecret(): string {
    return this.makeTotp().generateSecret();
  }

  getOtpauthUrl(secret: string, label: string): string {
    return this.makeTotp({ secret, label }).toURI();
  }

  async verifyCode(secret: string, code: string): Promise<boolean> {
    const result = await this.makeTotp({ secret }).verify(code, {
      epochTolerance: TOTP_CONFIG.EPOCH_TOLERANCE_S,
    });
    return result.valid;
  }

  encryptSecret(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decryptSecret(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_BYTES);
    const authTag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const encrypted = data.subarray(IV_BYTES + AUTH_TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
