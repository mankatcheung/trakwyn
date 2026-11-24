import { describe, expect, it } from 'vitest';
import { heroPreloadLinks } from '#/features/marketing/pages/heroPreloads';
import { getScreenshot } from '#/features/marketing/lib/screenshots';
import { marketingHead } from '#/lib/seo';

describe('heroPreloadLinks', () => {
  it('preloads the phone and desktop image for each colour scheme, each at its own width (JEF-684)', () => {
    const link = (href: string, media: string) => ({
      rel: 'preload',
      as: 'image',
      href,
      media,
      fetchPriority: 'high',
    });
    expect(heroPreloadLinks('board')).toEqual([
      link(
        '/screenshots/board-phone-light.webp',
        '(max-width: 639px) and (prefers-color-scheme: light)',
      ),
      link(
        getScreenshot('board', 'light').src,
        '(min-width: 640px) and (prefers-color-scheme: light)',
      ),
      link(
        '/screenshots/board-phone-dark.webp',
        '(max-width: 639px) and (prefers-color-scheme: dark)',
      ),
      link(
        getScreenshot('board', 'dark').src,
        '(min-width: 640px) and (prefers-color-scheme: dark)',
      ),
    ]);
  });

  it('preloads only the colour scheme when a hero has no phone variant', () => {
    expect(heroPreloadLinks('crop-board-header').map((l) => l.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
  });

  it('is appended to the page head after the canonical and hreflang links', () => {
    const { links } = marketingHead(
      { path: '/pricing', title: 'Pricing', description: 'Cost.' },
      'en',
      heroPreloadLinks('board'),
    );
    expect(links[0].rel).toBe('canonical');
    expect(links.slice(-4).map((l) => l.rel)).toEqual(['preload', 'preload', 'preload', 'preload']);
  });
});
