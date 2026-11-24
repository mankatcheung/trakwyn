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

import { FeaturesIndexPage } from '#/features/marketing/pages/FeaturesIndexPage';

describe('FeaturesIndexPage', () => {
  it('shows a real screenshot, in both themes, beside each deep dive (JEF-674)', () => {
    render(<FeaturesIndexPage />);

    [
      'screenshots.board.alt',
      'screenshots.cropAssistantReply.alt',
      'screenshots.cropResumeEditor.alt',
      'screenshots.cropStageFunnel.alt',
    ].forEach((key) => {
      expect(screen.getAllByAltText((en as Record<string, string>)[key])).toHaveLength(2);
    });
    // Every image on the page is a real capture, never a drawn placeholder.
    screen.getAllByRole('img').forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^\/screenshots\/[a-z-]+-(light|dark)\.webp$/);
    });
  });

  it('leads with the product: a hero screenshot between the heading and the first deep dive (JEF-675)', () => {
    render(<FeaturesIndexPage />);

    const [light, dark] = screen.getAllByAltText(
      (en as Record<string, string>)['screenshots.applicationDetail.alt'],
    );
    expect(light).toHaveAttribute('loading', 'eager');
    expect(light).toHaveAttribute('fetchpriority', 'high');
    expect(dark).toHaveAttribute('src', '/screenshots/application-detail-dark.webp');
    const heading = screen.getByRole('heading', { level: 1 });
    const firstDeepDive = screen.getAllByAltText(
      (en as Record<string, string>)['screenshots.board.alt'],
    )[0];
    expect(heading.compareDocumentPosition(light)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(light.compareDocumentPosition(firstDeepDive)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('has no alternating background bands and lists the rest instead of a card grid (JEF-676)', () => {
    const { container } = render(<FeaturesIndexPage />);

    // The closing CTA is the only filled band left in the page body.
    expect(
      container.querySelectorAll('main section.bg-stone-100, main section.bg-blue-950'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('main div.bg-stone-100')).toHaveLength(0);
    const list = screen.getByRole('heading', { name: /everything else/i }).nextElementSibling;
    expect(list?.tagName).toBe('UL');
    expect(list?.querySelectorAll(':scope > li')).toHaveLength(8);
  });

  it('closes with the shared stone CTA, not a blue block (JEF-676)', () => {
    render(<FeaturesIndexPage />);

    const cta = screen
      .getByRole('heading', { name: en['features.index.ctaTitle'] })
      .closest('section');
    expect(cta).toHaveClass('bg-stone-100');
    expect(cta).not.toHaveClass('bg-blue-950');
  });

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

  it('links every "Start for free" CTA to /register', () => {
    render(<FeaturesIndexPage />);

    const ctas = screen.getAllByRole('link', { name: 'Start for free' });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/register'));
  });
});
