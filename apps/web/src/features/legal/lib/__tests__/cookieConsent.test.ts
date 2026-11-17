import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

import {
  getStoredConsent,
  saveConsent,
  requestOpenCookiePreferences,
  onOpenCookiePreferencesRequested,
} from '#/features/legal/lib/cookieConsent';

describe('cookieConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGqlRequest.mockReset();
    mockGqlRequest.mockResolvedValue({ recordCookieConsent: true });
  });

  describe('getStoredConsent', () => {
    it('returns null when nothing is stored', () => {
      expect(getStoredConsent()).toBeNull();
    });

    it('returns null for malformed JSON rather than throwing', () => {
      localStorage.setItem('trakwyn_cookie_consent', 'not json');
      expect(getStoredConsent()).toBeNull();
    });

    it('returns null when the stored shape is missing fields', () => {
      localStorage.setItem('trakwyn_cookie_consent', JSON.stringify({ analytics: true }));
      expect(getStoredConsent()).toBeNull();
    });
  });

  describe('saveConsent', () => {
    it('persists the choice to localStorage with a timestamp', () => {
      saveConsent(true);

      const stored = getStoredConsent();
      expect(stored?.analytics).toBe(true);
      expect(typeof stored?.consentedAt).toBe('string');
    });

    it('sends the choice to the server, best-effort', async () => {
      saveConsent(false);

      await vi.waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('recordCookieConsent'),
          { analyticsAccepted: false },
        );
      });
    });

    it('still updates localStorage even if the server call fails', async () => {
      mockGqlRequest.mockRejectedValue(new Error('network error'));

      saveConsent(true);

      expect(getStoredConsent()?.analytics).toBe(true);
      // Let the rejected promise's .catch() run without this test failing on
      // an unhandled rejection.
      await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    });
  });

  describe('open-preferences event', () => {
    it('notifies listeners when requested', () => {
      const handler = vi.fn();
      const unsubscribe = onOpenCookiePreferencesRequested(handler);

      requestOpenCookiePreferences();

      expect(handler).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });
});
