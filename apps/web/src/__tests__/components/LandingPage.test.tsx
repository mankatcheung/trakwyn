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
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCapture,
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
        'landing.startFree': 'Start for free',
        'landing.passesNote':
          "Need Pro only for your search? A 3- or 6-month pass ends on its own, so there is nothing to cancel once you're hired.",
        'landing.heroTitleLine1': 'Track every application.',
        'landing.heroTitleLine2': 'Tailor every cover letter.',
        'landing.heroDescription':
          'Save jobs from any posting with one click, keep every application on one board, and get cover letters and resumes drafted from your own experience. Free to start.',
        'landing.heroTrustLine': 'Free plan · No credit card',
        'landing.features': 'Features',
        'landing.tracking': 'Application tracking',
        'landing.assistant': 'AI assistant',
        'landing.resumeCoverLetters': 'Resume & cover letters',
        'landing.analytics': 'Analytics & insights',
      })[key] ?? key,
  }),
}));

import { LandingPage } from '#/routes/index';
import userEvent from '@testing-library/user-event';

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

  it('reports which register CTA was clicked and where it sits', async () => {
    mockHasSessionCookie.mockReturnValue(false);
    const user = userEvent.setup();
    render(<LandingPage />);

    // One label everywhere (JEF-518), so the CTAs are told apart by position:
    // desktop header, mobile header, hero, AI demo, closing band.
    const ctas = screen.getAllByRole('link', { name: 'Start for free' });
    expect(ctas).toHaveLength(5);
    for (const cta of ctas) await user.click(cta);

    expect(mockCapture.mock.calls).toEqual([
      ['marketing_cta_clicked', { cta: 'get_started', location: 'header' }],
      ['marketing_cta_clicked', { cta: 'get_started', location: 'header_mobile' }],
      ['marketing_cta_clicked', { cta: 'start_free', location: 'hero' }],
      ['marketing_cta_clicked', { cta: 'start_free', location: 'ai_demo' }],
      ['marketing_cta_clicked', { cta: 'get_started_free', location: 'closing' }],
    ]);
  });

  it('shows the posting → cover letter sample after the board and before the feature cards (JEF-517)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const demo = screen.getByRole('region', { name: 'landing.aiDemo.title' });
    const board = screen.getByText('landing.boardLabel');
    const features = screen.getByRole('link', { name: /Analytics & insights/ });
    expect(board.compareDocumentPosition(demo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(demo.compareDocumentPosition(features)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('mentions the self-ending passes once, by the closing CTA', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<LandingPage />);
    expect(screen.getAllByText(/ends on its own/)).toHaveLength(1);
  });

  it('leads with the track-and-tailor headline and a no-card trust line', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Track every application.');
    expect(heading).toHaveTextContent('Tailor every cover letter.');
    expect(screen.getByText(/Save jobs from any posting with one click/)).toBeInTheDocument();
    expect(screen.getByText('Free plan · No credit card')).toBeInTheDocument();
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
