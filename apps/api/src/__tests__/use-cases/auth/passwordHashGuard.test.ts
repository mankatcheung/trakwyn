import { describe, it, expect } from 'vitest';
import { assertHasPassword } from '#src/use-cases/auth/passwordHashGuard.js';

describe('assertHasPassword', () => {
  it('does not throw for a set password hash', () => {
    expect(() => assertHasPassword('hashed-value')).not.toThrow();
  });

  it('throws UNAUTHORIZED when the hash is null', () => {
    let err: unknown;
    try {
      assertHasPassword(null);
    } catch (e) {
      err = e;
    }
    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
  });
});
