import { compare, hash } from '@node-rs/bcrypt';
import type { IPasswordHasher } from '#src/use-cases/ports/IPasswordHasher.js';
import { PASSWORD_HASH_COST } from '#src/use-cases/constants.js';

/**
 * bcrypt through `@node-rs/bcrypt` (JEF-534). It runs on libuv's thread pool,
 * so a sign-in no longer blocks the event loop the way the pure-JavaScript
 * `bcryptjs` did, and it reads the same `$2a$`/`$2b$` hashes.
 */
export class NodeRsPasswordHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, { cost: PASSWORD_HASH_COST });
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}
