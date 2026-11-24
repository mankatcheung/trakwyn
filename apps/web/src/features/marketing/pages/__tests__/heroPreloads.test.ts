import { describe, expect, it } from 'vitest';
import { heroPreloadLinks } from '#/features/marketing/pages/heroPreloads';
import { getScreenshot } from '#/features/marketing/lib/screenshots';
import { marketingHead } from '#/lib/seo';

describe('heroPreloadLinks', () => {
  it('preloads each theme variant only for its own colour scheme, at high priority', () => {
    expect(heroPreloadLinks('board')).toEqual([
      {
        rel: 'preload',
        as: 'image',
        href: getScreenshot('board', 'light').src,
        media: '(prefers-color-scheme: light)',
        fetchPriority: 'high',
      },
      {
        rel: 'preload',
        as: 'image',
        href: getScreenshot('board', 'dark').src,
        media: '(prefers-color-scheme: dark)',
        fetchPriority: 'high',
      },
    ]);
  });

  it('is appended to the page head after the canonical and hreflang links', () => {
    const { links } = marketingHead(
      { path: '/pricing', title: 'Pricing', description: 'Cost.' },
      'en',
      heroPreloadLinks('board'),
    );
    expect(links[0].rel).toBe('canonical');
    expect(links.slice(-2).map((l) => l.rel)).toEqual(['preload', 'preload']);
  });
});
