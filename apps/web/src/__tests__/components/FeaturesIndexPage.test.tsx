import { describe, expect, it, vi } from 'vitest';
import en from '#/i18n/en.json';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => false }));
vi.mock('#/lib/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [{ value: 'en', label: 'English' }],
  useLocale: () => ({
    locale: 'en',
    setLocale: vi.fn(),
    // Resolve against the real English bundle so assertions on rendered copy
    // keep working as keys are added (falls back to the key itself).
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { FeaturesIndexPage } from '#/routes/features/-components/FeaturesIndexPage';

describe('FeaturesIndexPage', () => {
  it('links each deep-dive card to its feature page', () => {
    render(<FeaturesIndexPage />);

    expect(screen.getByRole('link', { name: /Explore application tracking/ })).toHaveAttribute(
      'href',
      '/features/tracking',
    );
    expect(screen.getByRole('link', { name: /Explore the AI assistant/ })).toHaveAttribute(
      'href',
      '/features/ai-assistant',
    );
    expect(screen.getByRole('link', { name: /Explore resume/ })).toHaveAttribute(
      'href',
      '/features/resume-cover-letter',
    );
    expect(screen.getByRole('link', { name: /Explore analytics/ })).toHaveAttribute(
      'href',
      '/features/analytics',
    );
  });

  it('lists the non-deep-dive features as brief entries', () => {
    render(<FeaturesIndexPage />);

    [
      'Calendar & reminders',
      'Contacts',
      'Documents',
      'Notifications',
      'Security',
      'Bring your own AI key',
      'Browser extension',
      '5 languages',
    ].forEach((title) => {
      // "Browser extension" also labels the footer's Product link (JEF-424).
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    });
  });

  it('links the Browser extension entry to the Chrome Web Store listing (JEF-424)', () => {
    render(<FeaturesIndexPage />);

    // The footer carries a second "Browser extension" link, so find the tile
    // by the copy only it has.
    const tile = screen
      .getAllByRole('link', { name: /Browser extension/ })
      .find((link) => link.textContent?.includes('Add to Chrome'));
    expect(tile).toBeDefined();
    expect(tile).toHaveAttribute('href', CLIPPER_WEB_STORE_URL);
    expect(tile).toHaveAttribute('target', '_blank');
    expect(tile).toHaveAttribute('rel', 'noopener noreferrer');
    expect(tile).toHaveTextContent('LinkedIn, Indeed, Glassdoor, Greenhouse, Lever or Workday');
  });

  it('links the closing CTA to /register', () => {
    render(<FeaturesIndexPage />);

    expect(screen.getByRole('link', { name: 'Get started for free' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
