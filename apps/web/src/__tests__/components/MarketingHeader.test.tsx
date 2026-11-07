import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const { mockHasSessionCookie } = vi.hoisted(() => ({
  mockHasSessionCookie: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
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
        'landing.features': 'Features',
        'landing.signIn': 'Sign in',
        'landing.goDashboard': 'Go to dashboard',
        'landing.startFree': 'Start for free',
        'settings.language': 'Language',
        'guides.aiMcpSetup.eyebrow': 'Setup guide',
      })[key] ?? key,
  }),
}));

import { MarketingHeader } from '#/components/marketing/MarketingHeader';

describe('MarketingHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links Features to /features', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/features');
  });

  it('bolds the Features link when activeFeatures is set', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader activeFeatures />);

    expect(screen.getByRole('link', { name: 'Features' }).className).toContain('font-semibold');
  });

  it('does not bold the Features link outside /features', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Features' }).className).not.toContain('font-semibold');
  });

  it('links the setup guide to /ai-mcp-setup (JEF-231)', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Setup guide' })).toHaveAttribute(
      'href',
      '/ai-mcp-setup',
    );
  });

  it('bolds the setup guide link when activeGuide is set', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader activeGuide />);

    expect(screen.getByRole('link', { name: 'Setup guide' }).className).toContain('font-semibold');
  });

  it('shows "Sign in" pointing at /login for a logged-out visitor', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows "Go to dashboard" pointing at /dashboard once a session is detected', () => {
    mockHasSessionCookie.mockReturnValue(true);
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('links "Start for free" to /register, in the desktop nav and the mobile bar', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    const ctas = screen.getAllByRole('link', { name: 'Start for free' });
    expect(ctas).toHaveLength(2);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/register'));
  });

  it('is sticky, and gains a border and blur only once the page scrolls', () => {
    mockHasSessionCookie.mockReturnValue(false);
    const { container } = render(<MarketingHeader />);
    const header = container.querySelector('header')!;

    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(header.className).toContain('border-transparent');
    expect(header.className).not.toContain('backdrop-blur');

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(header.className).toContain('backdrop-blur');
    expect(header.className).not.toContain('border-transparent');

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header.className).toContain('border-transparent');
  });

  it('renders a theme toggle button, once for desktop and once for mobile', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    // One in the desktop nav row, one beside the mobile hamburger — both
    // always rendered, shown/hidden purely by the `sm:` breakpoint classes.
    expect(screen.getAllByRole('button', { name: /theme/i })).toHaveLength(2);
  });

  it('renders a locale picker, once for desktop and once for mobile', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingHeader />);

    // Icon-only triggers now — one per header cluster, popup closed by default.
    expect(screen.getAllByRole('button', { name: 'Language' })).toHaveLength(2);
  });
});
