import { describe, it, expect } from 'vitest';
import { calendarErrorKey } from '#/lib/calendarError';
import en from '#/i18n/en.json';

describe('calendarErrorKey', () => {
  it.each([
    ['provider_denied', 'integrations.calendarErrorDenied'],
    ['invalid_state', 'integrations.calendarErrorInvalidState'],
    ['provider_mismatch', 'integrations.calendarErrorInvalidState'],
    ['missing_code', 'integrations.calendarErrorFailed'],
    ['connect_failed', 'integrations.calendarErrorFailed'],
    ['not_configured', 'integrations.calendarErrorNotConfigured'],
  ])('maps %s to its own copy', (slug, key) => {
    expect(calendarErrorKey(slug)).toBe(key);
  });

  it('falls back to the generic failure for a slug it does not know', () => {
    expect(calendarErrorKey('anything_else')).toBe('integrations.calendarErrorFailed');
  });

  it('only ever returns a key that exists in the English strings', () => {
    const slugs = [
      'provider_denied',
      'invalid_state',
      'provider_mismatch',
      'missing_code',
      'connect_failed',
      'not_configured',
      'unknown',
    ];
    for (const slug of slugs) {
      expect(en).toHaveProperty([calendarErrorKey(slug)]);
    }
  });
});
