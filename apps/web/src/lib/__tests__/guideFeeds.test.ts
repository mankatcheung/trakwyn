import { describe, expect, it } from 'vitest';
import type { Guide } from '@trakwyn/content';
import {
  buildArticleJsonLd,
  buildRss,
  buildSitemap,
  escapeXml,
  STATIC_SITEMAP_PAGES,
} from '#/lib/guideFeeds';

const GUIDE: Guide = {
  slug: 'first-guide',
  body: '',
  frontmatter: {
    title: 'Fish & <Chips>',
    description: 'A "quoted" description',
    date: '2026-11-08',
    updated: '2026-11-09',
    tags: ['tracking'],
  },
};

describe('escapeXml', () => {
  it('escapes the five XML characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
    );
  });
});

describe('buildSitemap', () => {
  const xml = buildSitemap([GUIDE]);

  it('lists every static page and the guides index', () => {
    for (const { path } of STATIC_SITEMAP_PAGES) {
      const loc = path === '/' ? 'https://www.trakwyn.com' : `https://www.trakwyn.com${path}`;
      expect(xml).toContain(`<loc>${loc}</loc>`);
    }
    expect(xml).toContain('<loc>https://www.trakwyn.com/guides</loc>');
  });

  it('lists each guide with its last modified date', () => {
    expect(xml).toContain('<loc>https://www.trakwyn.com/guides/first-guide</loc>');
    expect(xml).toContain('<lastmod>2026-11-09</lastmod>');
  });

  it('is a urlset document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  describe('localized pages (JEF-653)', () => {
    /** The `<url>` block whose `<loc>` is `loc`. */
    function entry(loc: string): string {
      const block = xml.split('  <url>\n').find((b) => b.includes(`<loc>${loc}</loc>`));
      if (!block) throw new Error(`no <url> for ${loc}`);
      return block;
    }

    it('lists every localized page once per indexed locale', () => {
      for (const loc of [
        'https://www.trakwyn.com/pricing',
        'https://www.trakwyn.com/zh-hk/pricing',
        'https://www.trakwyn.com/zh-tw/pricing',
        'https://www.trakwyn.com/zh-cn/pricing',
        'https://www.trakwyn.com',
        'https://www.trakwyn.com/zh-hk',
        'https://www.trakwyn.com/zh-cn/features/tracking',
        'https://www.trakwyn.com/zh-tw/guides',
      ]) {
        expect(xml).toContain(`<loc>${loc}</loc>`);
      }
    });

    it('gives every entry the same reciprocal alternates, plus x-default', () => {
      const expected = [
        'hreflang="en" href="https://www.trakwyn.com/pricing"',
        'hreflang="zh-HK" href="https://www.trakwyn.com/zh-hk/pricing"',
        'hreflang="zh-TW" href="https://www.trakwyn.com/zh-tw/pricing"',
        'hreflang="zh-CN" href="https://www.trakwyn.com/zh-cn/pricing"',
        'hreflang="x-default" href="https://www.trakwyn.com/pricing"',
      ];
      for (const loc of [
        'https://www.trakwyn.com/pricing',
        'https://www.trakwyn.com/zh-hk/pricing',
        'https://www.trakwyn.com/zh-cn/pricing',
      ]) {
        const block = entry(loc);
        for (const link of expected) expect(block).toContain(link);
        expect(block.match(/<xhtml:link/g)).toHaveLength(5);
      }
    });

    it('does not localize auth pages or guide articles', () => {
      expect(xml).not.toContain('/zh-hk/login');
      expect(xml).not.toContain('/zh-hk/register');
      expect(xml).not.toContain('/zh-hk/guides/first-guide');
      expect(entry('https://www.trakwyn.com/login')).not.toContain('xhtml:link');
      expect(entry('https://www.trakwyn.com/guides/first-guide')).not.toContain('xhtml:link');
    });
  });
});

describe('buildRss', () => {
  const xml = buildRss([GUIDE]);

  it('is RSS 2.0 with one escaped item per guide', () => {
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Fish &amp; &lt;Chips&gt;</title>');
    expect(xml).toContain('<link>https://www.trakwyn.com/guides/first-guide</link>');
    expect(xml).toContain('<pubDate>Sun, 08 Nov 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<category>tracking</category>');
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  it('points at its own URL', () => {
    expect(xml).toContain('href="https://www.trakwyn.com/guides/rss.xml"');
  });

  it('has no items for no guides', () => {
    expect(buildRss([])).not.toContain('<item>');
  });
});

describe('buildArticleJsonLd', () => {
  it('describes the guide as a schema.org Article', () => {
    expect(buildArticleJsonLd(GUIDE)).toMatchObject({
      '@type': 'Article',
      headline: 'Fish & <Chips>',
      datePublished: '2026-11-08',
      dateModified: '2026-11-09',
      mainEntityOfPage: 'https://www.trakwyn.com/guides/first-guide',
    });
  });

  it('falls back to the publish date when never updated', () => {
    const noUpdate = { ...GUIDE, frontmatter: { ...GUIDE.frontmatter, updated: undefined } };
    expect(buildArticleJsonLd(noUpdate).dateModified).toBe('2026-11-08');
  });
});
