import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetRequestHeader } = vi.hoisted(() => ({
  mockGetRequestHeader: vi.fn(),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: mockGetRequestHeader,
}));

import { getRequiresCookieConsent } from '#/lib/consentRegion';

describe('getRequiresCookieConsent', () => {
  beforeEach(() => {
    mockGetRequestHeader.mockReset();
  });

  it('requires consent for an EU country from x-vercel-ip-country', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'x-vercel-ip-country' ? 'DE' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(true);
  });

  it('requires consent for the UK', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'x-vercel-ip-country' ? 'GB' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(true);
  });

  it('does not require consent for a non-EU/EEA/UK/CH country', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'x-vercel-ip-country' ? 'US' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(false);
  });

  it('is case-insensitive on the country code', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'x-vercel-ip-country' ? 'de' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(true);
  });

  it('falls back to Accept-Language when the country header is absent', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'accept-language' ? 'de-DE,de;q=0.9,en;q=0.8' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(true);
  });

  it('does not match on a lower-priority language in Accept-Language', async () => {
    // English is the visitor's actual preference; German only appears as a
    // fallback further down the list — not a real EU signal.
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'accept-language' ? 'en-US,en;q=0.9,de;q=0.5' : undefined,
    );

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(false);
  });

  it('defaults to not requiring consent when neither header is present', async () => {
    mockGetRequestHeader.mockReturnValue(undefined);

    expect((await getRequiresCookieConsent()).requiresConsent).toBe(false);
  });
});

describe('getRequiresCookieConsent country (JEF-366)', () => {
  beforeEach(() => {
    mockGetRequestHeader.mockReset();
  });

  const withCountryHeader = (value: string | undefined) =>
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'x-vercel-ip-country' ? value : undefined,
    );

  it("returns Vercel's country, which is what PostHog's location breakdown uses", async () => {
    withCountryHeader('US');

    expect(await getRequiresCookieConsent()).toEqual({ requiresConsent: false, country: 'US' });
  });

  it('upper-cases it', async () => {
    withCountryHeader('de');

    expect((await getRequiresCookieConsent()).country).toBe('DE');
  });

  it('returns null rather than a malformed value', async () => {
    withCountryHeader('XX1');

    expect((await getRequiresCookieConsent()).country).toBeNull();
  });

  it('never guesses the country from Accept-Language', async () => {
    mockGetRequestHeader.mockImplementation((name: string) =>
      name === 'accept-language' ? 'de-DE,de;q=0.9' : undefined,
    );

    // Consent still falls back to the language; location doesn't.
    expect(await getRequiresCookieConsent()).toEqual({ requiresConsent: true, country: null });
  });
});
