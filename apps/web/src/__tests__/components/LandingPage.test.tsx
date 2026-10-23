import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';

const { mockHasSessionCookie, mockNavigate } = vi.hoisted(() => ({
  mockHasSessionCookie: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => options,
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('#/graphql/client', () => ({
  hasSessionCookie: mockHasSessionCookie,
}));

vi.mock('#/lib/theme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) =>
      ({
        'landing.signIn': 'Sign in',
        'landing.goDashboard': 'Go to dashboard',
        'landing.getStarted': 'Get started',
        'landing.startFree': 'Start for free',
        'landing.getStartedFree': 'Get started for free',
        'landing.features': 'Features',
        'landing.tracking': 'Application tracking',
        'landing.assistant': 'AI assistant',
        'landing.resumeCoverLetters': 'Resume & cover letters',
        'landing.analytics': 'Analytics & insights',
      })[key] ?? key,
  }),
}));

import { LandingPage } from '#/routes/index';

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows dashboard links when rendered while a session exists', () => {
    mockHasSessionCookie.mockReturnValue(true);

    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: 'Go to dashboard' })).toHaveLength(3);
    expect(screen.queryAllByRole('link', { name: 'Sign in' })).toHaveLength(0);
    screen
      .getAllByRole('link', { name: 'Go to dashboard' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/dashboard'));
  });

  it('keeps sign-in links for logged-out users', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: 'Sign in' })).toHaveLength(3);
    expect(screen.queryAllByRole('link', { name: 'Go to dashboard' })).toHaveLength(0);
    screen
      .getAllByRole('link', { name: 'Sign in' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/login'));
  });

  it('links to the Privacy Policy and Terms of Service in the footer', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    expect(screen.getByRole('link', { name: 'auth.privacyPolicy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'auth.termsOfService' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });

  it('links Features in the header to /features (JEF-228)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/features');
  });

  it('links each of the four highlighted feature cards to its /features/* page (JEF-228)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    // "Application tracking" etc. also appear as Product links in the
    // shared footer (MarketingFooter) — every match should agree on the href.
    const expectEveryLinkNamedToPointAt = (name: RegExp, href: string) => {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => expect(link).toHaveAttribute('href', href));
    };

    expectEveryLinkNamedToPointAt(/Application tracking/, '/features/tracking');
    expectEveryLinkNamedToPointAt(/AI assistant/, '/features/ai-assistant');
    expectEveryLinkNamedToPointAt(/Resume & cover letters/, '/features/resume-cover-letter');
    expectEveryLinkNamedToPointAt(/Analytics & insights/, '/features/analytics');
  });

  it('offers the Clipper between the feature cards and the steps (JEF-424)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const clipper = screen.getByRole('region', { name: 'landing.clipper.title' });
    expect(within(clipper).getByRole('link', { name: 'landing.clipper.cta' })).toHaveAttribute(
      'href',
      CLIPPER_WEB_STORE_URL,
    );
    const features = screen.getByRole('link', { name: /Analytics & insights/ });
    const steps = screen.getByText('landing.step1');
    expect(features.compareDocumentPosition(clipper)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(clipper.compareDocumentPosition(steps)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  describe('logged-in landing behaviour (JEF-236)', () => {
    it('never navigates away on mount, even when a session already exists', () => {
      // JEF-213 forced logged-in visitors from `/` over to /dashboard;
      // JEF-236 removed that. The landing page is content, not a gate — a
      // signed-in visitor reads it like anyone else and leaves via the
      // ordinary "Go to dashboard" link.
      mockHasSessionCookie.mockReturnValue(true);

      render(<LandingPage />);

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('leaves logged-out visitors alone as well', () => {
      mockHasSessionCookie.mockReturnValue(false);

      render(<LandingPage />);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
