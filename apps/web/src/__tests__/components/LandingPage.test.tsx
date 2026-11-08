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
    // The hero board screenshot comes first; the feature rows repeat it later.
    const board = screen.getAllByAltText('screenshots.board.alt')[0];
    const features = screen.getAllByTestId('feature-row')[3];
    expect(board.compareDocumentPosition(demo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(demo.compareDocumentPosition(features)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('loads the hero board screenshot eagerly at high priority, with its size set (JEF-530)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const [light, dark] = screen.getAllByAltText('screenshots.board.alt');
    expect(light).toHaveAttribute('loading', 'eager');
    expect(dark).toHaveAttribute('loading', 'lazy');
    for (const img of [light, dark]) {
      expect(img).toHaveAttribute('fetchpriority', 'high');
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
    }
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

  it('shows the four features as rows in the footer order, each with a screenshot and a /features/* link (JEF-529)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const rows = screen.getAllByTestId('feature-row');
    expect(rows).toHaveLength(4);
    const expected = [
      ['Application tracking', '/features/tracking', 'screenshots.board.alt'],
      ['AI assistant', '/features/ai-assistant', 'screenshots.assistant.alt'],
      ['Resume & cover letters', '/features/resume-cover-letter', 'screenshots.resume.alt'],
      ['Analytics & insights', '/features/analytics', 'screenshots.analytics.alt'],
    ] as const;
    expected.forEach(([title, href, alt], i) => {
      const row = within(rows[i]);
      expect(row.getByRole('heading', { name: new RegExp(title) })).toBeInTheDocument();
      expect(row.getByRole('link', { name: /landing\.learnMore/ })).toHaveAttribute('href', href);
      expect(row.getAllByAltText(alt)).toHaveLength(2);
    });
  });

  it('alternates the side of the screenshot and tags only analytics as Pro (JEF-529)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const rows = screen.getAllByTestId('feature-row');
    expect(rows[0].querySelector('.lg\\:order-1')).toBeNull();
    expect(rows[1].querySelector('.lg\\:order-1')).not.toBeNull();
    expect(rows[2].querySelector('.lg\\:order-1')).toBeNull();
    expect(rows[3].querySelector('.lg\\:order-1')).not.toBeNull();
    expect(within(rows[3]).getByText('plan.badgePro')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('plan.badgePro')).toBeNull();
  });

  it('offers the Clipper between the feature cards and the steps (JEF-424)', () => {
    mockHasSessionCookie.mockReturnValue(false);

    render(<LandingPage />);

    const clipper = screen.getByRole('region', { name: 'landing.clipper.title' });
    expect(within(clipper).getByRole('link', { name: 'landing.clipper.cta' })).toHaveAttribute(
      'href',
      CLIPPER_WEB_STORE_URL,
    );
    const features = screen.getAllByTestId('feature-row')[3];
    const steps = screen.getByText('landing.step1');
    expect(features.compareDocumentPosition(clipper)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(clipper.compareDocumentPosition(steps)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('answers four questions before the closing steps, with FAQPage JSON-LD (JEF-519)', () => {
    mockHasSessionCookie.mockReturnValue(false);
    const { container } = render(<LandingPage />);

    const ids = ['free', 'privacy', 'clipper', 'mobile'];
    for (const id of ids) expect(screen.getByTestId(`faq-${id}`)).not.toHaveAttribute('open');
    const faq = screen.getByRole('region', { name: 'faq.title' });
    const steps = screen.getByRole('heading', { name: 'landing.getStartedMinutes' });
    expect(faq.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const faqScript = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent ?? '{}') as { '@type': string; mainEntity?: unknown[] })
      .find((d) => d['@type'] === 'FAQPage');
    expect(faqScript?.mainEntity).toHaveLength(ids.length);
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
