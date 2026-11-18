import { describe, expect, it } from 'vitest';
import { oauthErrorKey } from '#/features/auth/lib/oauthError';

describe('oauthErrorKey (JEF-203)', () => {
  it.each([
    ['access_denied', 'oauthError.accessDenied'],
    ['missing_code', 'oauthError.failed'],
    ['invalid_state', 'oauthError.invalidState'],
    ['provider_mismatch', 'oauthError.invalidState'],
    ['missing_user', 'oauthError.failed'],
    ['already_linked', 'oauthError.alreadyLinked'],
    ['email_in_use', 'oauthError.emailInUse'],
    ['email_not_verified', 'oauthError.emailNotVerified'],
    ['account_not_found', 'oauthError.accountNotFound'],
    ['failed', 'oauthError.failed'],
  ])('maps %s to %s', (slug, key) => {
    expect(oauthErrorKey(slug)).toBe(key);
  });

  it.each(['', 'something_new', 'ACCESS_DENIED', '<script>', 'constructor', '__proto__'])(
    'falls back to the generic failure for the unknown slug %j',
    (slug) => {
      expect(oauthErrorKey(slug)).toBe('oauthError.failed');
    },
  );
});
