import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureLocaleLoaded } from '#/lib/i18n';
import { INDEXED_LOCALES, localizedPath } from '#/lib/localePaths';
import {
  legalHead,
  marketingHead,
  marketingMeta,
  OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  pageUrl,
  seoText,
  SITE_URL,
  type LinkTag,
  type SeoKey,
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
    expect(head.links[0]).toEqual({ rel: 'canonical', href: `${SITE_URL}/pricing` });
    expect(content(head.meta, 'og:url')).toBe(head.links[0].href);
  });

  it('gives a page with no locale versions a canonical and nothing else', () => {
    const head = marketingHead({ path: '/guides/first-guide', title: 'T', description: 'D' });
    expect(head.links).toEqual([{ rel: 'canonical', href: `${SITE_URL}/guides/first-guide` }]);
    expect(
      head.meta.filter((tag) => 'property' in tag && tag.property === 'og:locale:alternate'),
    ).toEqual([]);
  });
});

const ALL_SEO_KEYS: SeoKey[] = [
  'home',
  'features',
  'tracking',
  'aiAssistant',
  'resumeCoverLetter',
  'analytics',
  'pricing',
  'guides',
  'aiMcpSetup',
  'privacy',
  'terms',
  'accessibility',
];

describe('localized heads (JEF-653)', () => {
  beforeAll(async () => {
    await Promise.all(INDEXED_LOCALES.map((locale) => ensureLocaleLoaded(locale)));
  });

  const hreflangs = (links: LinkTag[]) =>
    Object.fromEntries(links.filter((l) => l.rel === 'alternate').map((l) => [l.hrefLang, l.href]));

  it.each(INDEXED_LOCALES)('%s: names itself canonical and lists every locale', (locale) => {
    const { links } = marketingHead({ path: '/pricing', seo: 'pricing' }, locale);
    expect(links[0]).toEqual({
      rel: 'canonical',
      href: pageUrl(localizedPath('/pricing', locale)),
    });
    // The same set on every page in the group, or Google ignores it.
    expect(hreflangs(links)).toEqual({
      en: `${SITE_URL}/pricing`,
      'zh-HK': `${SITE_URL}/zh-hk/pricing`,
      'zh-TW': `${SITE_URL}/zh-tw/pricing`,
      'zh-CN': `${SITE_URL}/zh-cn/pricing`,
      'x-default': `${SITE_URL}/pricing`,
    });
  });

  it('points the home page at the bare site URL and its locale roots', () => {
    const { links } = marketingHead({ path: '/', seo: 'home' }, 'zh-HK');
    expect(links[0].href).toBe(`${SITE_URL}/zh-hk`);
    expect(hreflangs(links)).toMatchObject({ en: SITE_URL, 'x-default': SITE_URL });
  });

  it('sets og:locale and og:url for the page locale', () => {
    const meta = marketingMeta({ path: '/pricing', seo: 'pricing' }, 'zh-TW');
    expect(content(meta, 'og:locale')).toBe('zh_TW');
    expect(content(meta, 'og:url')).toBe(`${SITE_URL}/zh-tw/pricing`);
  });

  it('has no og:locale:alternate, which the router would collapse to one tag', () => {
    // It repeats one property, and the router keeps one meta per name/property.
    const meta = marketingMeta({ path: '/pricing', seo: 'pricing' }, 'zh-TW');
    expect(content(meta, 'og:locale:alternate')).toBeUndefined();
  });

  it('localizes the title, description and card text', () => {
    const meta = marketingMeta({ path: '/pricing', seo: 'pricing' }, 'zh-HK');
    expect(content(meta, 'og:title')).toBe('價格 — Trakwyn');
    expect(content(meta, 'description')).toContain('專業版');
    expect(content(meta, 'twitter:title')).toBe('價格 — Trakwyn');
    expect(content(meta, 'og:image:alt')).not.toBe(OG_IMAGE_ALT);
    expect(content(marketingMeta({ path: '/pricing', seo: 'pricing' }), 'og:image:alt')).toBe(
      OG_IMAGE_ALT,
    );
  });

  describe('seoText', () => {
    it.each(INDEXED_LOCALES.flatMap((l) => ALL_SEO_KEYS.map((k) => [l, k] as const)))(
      '%s has real text for %s',
      (locale, key) => {
        const { title, description } = seoText(key, locale);
        // A missing key comes back as the key itself.
        expect(title).not.toMatch(/^seo\./);
        expect(description).not.toMatch(/^seo\./);
        expect(title).toContain('Trakwyn');
      },
    );

    it('is not the English text in a Chinese locale', () => {
      for (const key of ALL_SEO_KEYS) {
        expect(seoText(key, 'zh-HK').description).not.toBe(seoText(key, 'en').description);
      }
    });
  });

  describe('legalHead', () => {
    it('has a title, description, canonical and hreflang, but no preview card', () => {
      const head = legalHead({ path: '/privacy', seo: 'privacy' }, 'zh-CN');
      expect(head.meta).toEqual([
        { title: '隐私政策 — Trakwyn' },
        { name: 'description', content: 'Trakwyn 如何收集、使用和保护你的信息。' },
      ]);
      expect(head.links[0]).toEqual({ rel: 'canonical', href: `${SITE_URL}/zh-cn/privacy` });
      expect(hreflangs(head.links)).toHaveProperty('x-default', `${SITE_URL}/privacy`);
    });
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
