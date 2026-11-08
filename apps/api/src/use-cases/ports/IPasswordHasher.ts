/**
 * Hashes and checks passwords (JEF-534). The cost factor is the adapter's
 * business, so no use case depends on how a hash is made.
 */
export interface IPasswordHasher {
  /** Resolves a salted hash of `plain`. */
  hash(plain: string): Promise<string>;
  /** Resolves true when `plain` matches `hash`. Never throws for a well-formed hash. */
  compare(plain: string, hash: string): Promise<boolean>;
}
