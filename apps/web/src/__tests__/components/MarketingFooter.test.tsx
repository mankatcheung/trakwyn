import { describe, expect, it, vi, beforeEach } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';

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

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    // Resolve against the real English bundle so assertions on rendered copy
    // keep working as keys are added (falls back to the key itself).
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { MarketingFooter } from '#/components/marketing/MarketingFooter';

describe('MarketingFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links each Product entry to its feature page', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name: 'Application tracking' })).toHaveAttribute(
      'href',
      '/features/tracking',
    );
    expect(screen.getByRole('link', { name: 'AI assistant' })).toHaveAttribute(
      'href',
      '/features/ai-assistant',
    );
    expect(screen.getByRole('link', { name: /Resume/ })).toHaveAttribute(
      'href',
      '/features/resume-cover-letter',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/features/analytics',
    );
  });

  it('links the Product column to the Clipper on the Chrome Web Store (JEF-424)', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingFooter />);

    const link = screen.getByRole('link', { name: /Browser extension/ });
    expect(link).toHaveAttribute('href', CLIPPER_WEB_STORE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows "Sign in" for a logged-out visitor and "Go to dashboard" once a session is detected', () => {
    mockHasSessionCookie.mockReturnValue(false);
    const { unmount } = render(<MarketingFooter />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    unmount();

    mockHasSessionCookie.mockReturnValue(true);
    render(<MarketingFooter />);
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('links to the Privacy Policy and Terms of Service', () => {
    mockHasSessionCookie.mockReturnValue(false);
    render(<MarketingFooter />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });
});
