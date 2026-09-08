/**
 * Encrypts users' LLM API keys at rest.
 *
 * `context` binds a ciphertext to the row it belongs to — callers pass
 * `${userId}:${provider}` — so a value copied from one row to another (a
 * DB-write attacker, a bad migration) fails to decrypt instead of quietly
 * spending someone else's key. Optional only because values encrypted
 * before the binding existed carry none; new values always get one.
 */
export interface ILlmApiKeyCipher {
  encrypt(plaintext: string, context?: string): string;
  decrypt(ciphertext: string, context?: string): string;
}
