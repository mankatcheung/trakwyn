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
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
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
