import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { mockGqlRequest, mockGetRequiresCookieConsent, mockInitAnalytics, mockShutdownAnalytics } =
  vi.hoisted(() => ({
    mockGqlRequest: vi.fn(),
    mockGetRequiresCookieConsent: vi.fn(),
    mockInitAnalytics: vi.fn(),
    mockShutdownAnalytics: vi.fn(),
  }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/consentRegion', () => ({
  getRequiresCookieConsent: mockGetRequiresCookieConsent,
}));

vi.mock('#/lib/analytics', () => ({
  initAnalytics: mockInitAnalytics,
  shutdownAnalytics: mockShutdownAnalytics,
}));

import { CookieConsent } from '#/components/CookieConsent';
import { requestOpenCookiePreferences } from '#/lib/cookieConsent';
import type { ConsentRegion } from '#/lib/consentRegion';

const region = (requiresConsent: boolean, country: string | null = null): ConsentRegion => ({
  requiresConsent,
  country,
});

describe('CookieConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGqlRequest.mockReset().mockResolvedValue({ recordCookieConsent: true });
    mockGetRequiresCookieConsent.mockReset();
    mockInitAnalytics.mockReset().mockResolvedValue(null);
    mockShutdownAnalytics.mockReset();
  });

  it('loads analytics immediately outside a consent-required region, with no banner', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(false));
    render(<CookieConsent />);

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());
    expect(screen.queryByText(/necessary cookies to keep you signed in/i)).not.toBeInTheDocument();
  });

  it("passes the visitor's country to analytics for the location breakdown (JEF-366)", async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(false, 'US'));
    render(<CookieConsent />);

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalledWith('US'));
  });

  it('passes the country only once consent is given, not with the banner up', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true, 'DE'));
    render(<CookieConsent />);

    fireEvent.click(await screen.findByRole('button', { name: /accept all/i }));

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalledWith('DE'));
    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
  });

  it('shows the banner and blocks analytics in a consent-required region with no prior choice', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    await waitFor(() =>
      expect(screen.getByText(/necessary cookies to keep you signed in/i)).toBeInTheDocument(),
    );
    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  it('does not show the banner when a choice is already stored, even in a consent-required region', async () => {
    localStorage.setItem(
      'trakwyn_cookie_consent',
      JSON.stringify({ analytics: true, consentedAt: new Date().toISOString() }),
    );
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());
    expect(screen.queryByText(/necessary cookies to keep you signed in/i)).not.toBeInTheDocument();
  });

  it('respects a stored rejection by keeping analytics blocked', async () => {
    localStorage.setItem(
      'trakwyn_cookie_consent',
      JSON.stringify({ analytics: false, consentedAt: new Date().toISOString() }),
    );
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    await waitFor(() => expect(mockGetRequiresCookieConsent).toHaveBeenCalled());
    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  it('"Accept all" dismisses the banner, loads analytics, and records the choice', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    fireEvent.click(await screen.findByRole('button', { name: /accept all/i }));

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /accept all/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('recordCookieConsent'), {
        analyticsAccepted: true,
      }),
    );
  });

  it('"Reject non-essential" dismisses the banner without loading analytics', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    fireEvent.click(await screen.findByRole('button', { name: /reject non-essential/i }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /reject non-essential/i }),
      ).not.toBeInTheDocument(),
    );
    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  it('"Manage preferences" opens a panel that saves the chosen category', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    fireEvent.click(await screen.findByRole('button', { name: /manage preferences/i }));

    const analyticsToggle = await screen.findByRole('checkbox', { name: /^analytics$/i });
    expect(analyticsToggle).not.toBeChecked();
    fireEvent.click(analyticsToggle);
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());
  });

  it('the "Necessary" category is always on and cannot be unchecked', async () => {
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    fireEvent.click(await screen.findByRole('button', { name: /manage preferences/i }));

    const necessaryToggle = await screen.findByRole('checkbox', { name: /^necessary$/i });
    expect(necessaryToggle).toBeChecked();
    expect(necessaryToggle).toBeDisabled();
  });

  it('reopens the preferences panel when requestOpenCookiePreferences is dispatched, regardless of region', async () => {
    localStorage.setItem(
      'trakwyn_cookie_consent',
      JSON.stringify({ analytics: false, consentedAt: new Date().toISOString() }),
    );
    mockGetRequiresCookieConsent.mockResolvedValue(region(false));
    render(<CookieConsent />);

    await waitFor(() => expect(mockGetRequiresCookieConsent).toHaveBeenCalled());
    requestOpenCookiePreferences();

    expect(await screen.findByRole('button', { name: /save preferences/i })).toBeInTheDocument();
  });
  // JEF-349: PostHog does error reporting as well as analytics, which makes
  // it tempting to start it early "just for errors". These two tests pin the
  // decision that it does not.
  it('starts nothing while the region check is still in flight', async () => {
    let resolveRegion: (value: ConsentRegion) => void = () => {};
    mockGetRequiresCookieConsent.mockReturnValue(
      new Promise<ConsentRegion>((resolve) => {
        resolveRegion = resolve;
      }),
    );

    render(<CookieConsent />);

    // The window before the region is known is exactly when a naive
    // implementation would have loaded the SDK.
    expect(mockInitAnalytics).not.toHaveBeenCalled();

    resolveRegion(region(true));
    await waitFor(() =>
      expect(screen.getByText(/necessary cookies to keep you signed in/i)).toBeInTheDocument(),
    );
    expect(mockInitAnalytics).not.toHaveBeenCalled();
  });

  it('shuts analytics down when a previously-granted consent is withdrawn', async () => {
    localStorage.setItem(
      'trakwyn_cookie_consent',
      JSON.stringify({ analytics: true, consentedAt: new Date().toISOString() }),
    );
    mockGetRequiresCookieConsent.mockResolvedValue(region(true));
    render(<CookieConsent />);

    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());

    requestOpenCookiePreferences();
    const analyticsToggle = await screen.findByRole('checkbox', { name: /^analytics$/i });
    expect(analyticsToggle).toBeChecked();
    fireEvent.click(analyticsToggle);
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    // Not merely "stops sending": opting out is what clears the cookies and
    // localStorage PostHog had already written.
    await waitFor(() => expect(mockShutdownAnalytics).toHaveBeenCalled());
  });
});
