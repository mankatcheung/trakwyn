import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  marketingHead,
  marketingMeta,
  OG_IMAGE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  pageUrl,
  SITE_URL,
} from '#/lib/seo';

const page = { path: '/pricing', title: 'Pricing — Trakwyn', description: 'What it costs.' };

function content(meta: ReturnType<typeof marketingMeta>, key: string): string | undefined {
  for (const tag of meta) {
    if ('property' in tag && tag.property === key) return tag.content;
    if ('name' in tag && tag.name === key) return tag.content;
  }
  return undefined;
}

/** Reads the IHDR chunk: bytes 16–23 of a PNG are its width and height. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('pageUrl', () => {
  it('is the bare site URL for the home page', () => {
    expect(pageUrl('/')).toBe(SITE_URL);
  });

  it('appends any other path', () => {
    expect(pageUrl('/features/tracking')).toBe(`${SITE_URL}/features/tracking`);
  });
});

describe('marketingMeta', () => {
  const meta = marketingMeta(page);

  it('sets the title, description and page URL', () => {
    expect(meta).toContainEqual({ title: page.title });
    expect(content(meta, 'description')).toBe(page.description);
    expect(content(meta, 'og:url')).toBe(`${SITE_URL}/pricing`);
    expect(content(meta, 'og:title')).toBe(page.title);
    expect(content(meta, 'og:description')).toBe(page.description);
    expect(content(meta, 'twitter:title')).toBe(page.title);
    expect(content(meta, 'twitter:description')).toBe(page.description);
  });

  it('sends the landscape card as a large image, not the square app icon', () => {
    expect(content(meta, 'twitter:card')).toBe('summary_large_image');
    expect(content(meta, 'og:image')).toBe(OG_IMAGE);
    expect(content(meta, 'twitter:image')).toBe(OG_IMAGE);
    expect(OG_IMAGE).not.toMatch(/logo\d+\.png/);
    expect(content(meta, 'og:image:width')).toBe('1200');
    expect(content(meta, 'og:image:height')).toBe('630');
    expect(content(meta, 'og:image:type')).toBe('image/png');
    expect(content(meta, 'og:image:alt')).toBeTruthy();
    expect(content(meta, 'og:site_name')).toBe('Trakwyn');
  });

  it('uses absolute URLs, since scrapers do not resolve relative ones', () => {
    expect(content(meta, 'og:image')).toMatch(/^https:\/\//);
    expect(content(meta, 'og:url')).toMatch(/^https:\/\//);
  });
});

describe('marketingHead', () => {
  it('adds the canonical link for the same URL as og:url', () => {
    const head = marketingHead(page);
    expect(head.links).toEqual([{ rel: 'canonical', href: `${SITE_URL}/pricing` }]);
    expect(content(head.meta, 'og:url')).toBe(head.links[0].href);
  });
});

describe('public/og-image.png', () => {
  const file = join(import.meta.dirname, '..', '..', '..', 'public', 'og-image.png');

  it('is the size the meta tags declare', () => {
    expect(pngSize(file)).toEqual({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });
  });

  it('stays under the ~300 KB WhatsApp drops previews above', () => {
    expect(readFileSync(file).byteLength).toBeLessThan(300 * 1024);
  });
});
