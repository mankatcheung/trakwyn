import { describe, expect, it } from 'vitest';
import { NodeRsPasswordHasher } from '#src/infrastructure/auth/NodeRsPasswordHasher.js';
import { PASSWORD_HASH_COST } from '#src/use-cases/constants.js';

const PASSWORD = 'Correct-Horse-1';

/**
 * Made with `bcryptjs` 3.0.3, the library this adapter replaced (JEF-534), so
 * accounts created before the swap can still sign in. Do not regenerate them
 * with the new hasher: that would defeat the test.
 */
const BCRYPTJS_HASH_2B_COST_4 = '$2b$04$n0ktaPb25Uh5WMQO5mMdKeZhpgVYNXJSiN7q71X6uCn9i052ea8qq';
const BCRYPTJS_HASH_2A_COST_12 = '$2a$12$dt6vG646iYIpMIpKNLxCIOdDKQRT6SAaKYqti9oKxjsA2MeuREIuC';

describe('NodeRsPasswordHasher', () => {
  const hasher = new NodeRsPasswordHasher();

  it('hashes at the configured cost', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(PASSWORD_HASH_COST).toBe(12);
    expect(hash).toMatch(new RegExp(`^\\$2[ab]\\$${PASSWORD_HASH_COST}\\$`));
  });

  it('salts every hash differently and verifies each one', async () => {
    const [a, b] = await Promise.all([hasher.hash(PASSWORD), hasher.hash(PASSWORD)]);

    expect(a).not.toBe(b);
    expect(await hasher.compare(PASSWORD, a)).toBe(true);
    expect(await hasher.compare(PASSWORD, b)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(await hasher.compare('Wrong-Horse-1', hash)).toBe(false);
    expect(await hasher.compare('', hash)).toBe(false);
  });

  describe('hashes made by bcryptjs (existing users keep signing in)', () => {
    it.each([
      ['$2b$ at cost 4', BCRYPTJS_HASH_2B_COST_4],
      ['$2a$ at cost 12', BCRYPTJS_HASH_2A_COST_12],
    ])('verifies a %s hash', async (_label, hash) => {
      expect(await hasher.compare(PASSWORD, hash)).toBe(true);
      expect(await hasher.compare('Wrong-Horse-1', hash)).toBe(false);
    });
  });
});
