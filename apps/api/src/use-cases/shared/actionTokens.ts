import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Minting and hashing for `UserActionToken`s (JEF-463). Only the hash is
 * stored, so a database read does not hand out a working link or code.
 */

/** A random link token and the hash to store for it. */
export function mintLinkToken(randomByteCount: number): { raw: string; hash: string } {
  const raw = randomBytes(randomByteCount).toString('hex');
  return { raw, hash: hashLinkToken(raw) };
}

export function hashLinkToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A zero-padded numeric code, uniformly drawn. */
export function mintNumericCode(digits: number): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}

/**
 * Keyed by the user as well as the code: a six-digit code alone has a million
 * values, so without the user id a table of every hash would be one list for
 * everyone.
 */
export function hashStepUpCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

/** Compares two hex hashes without leaking where they differ. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
