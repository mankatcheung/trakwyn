import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrubValue } from '#/lib/analytics/scrub';

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCapture,
}));

import { consumeOAuthRegistration, markOAuthRegistration, trackCta } from '#/lib/analytics/funnel';

describe('funnel events (JEF-514)', () => {
  beforeEach(() => {
    mockCapture.mockClear();
    window.sessionStorage.clear();
  });

  it('trackCta sends the cta and its location', () => {
    trackCta('start_free', 'hero');
    expect(mockCapture).toHaveBeenCalledWith('marketing_cta_clicked', {
      cta: 'start_free',
      location: 'hero',
    });
  });

  it('reports an OAuth sign-up once, then forgets it', () => {
    markOAuthRegistration('google');

    consumeOAuthRegistration();
    consumeOAuthRegistration();

    expect(mockCapture.mock.calls).toEqual([['register_completed', { method: 'google' }]]);
  });

  it('reports nothing when the visitor did not come from the register page', () => {
    consumeOAuthRegistration();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('ignores a marker that is not a known provider', () => {
    window.sessionStorage.setItem('trakwyn_oauth_registration', 'someone@example.com');
    consumeOAuthRegistration();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('keeps every funnel property intact through the scrubber', () => {
    const properties = [
      { cta: 'get_started_free', location: 'feature_closing' },
      { method: 'password' },
      { plan_option: 'pass3Months' },
    ];
    for (const p of properties) expect(scrubValue(p)).toEqual(p);
  });
});
