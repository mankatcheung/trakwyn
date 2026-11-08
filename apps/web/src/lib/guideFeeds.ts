import type { Guide } from '@trakwyn/content';
import { OG_IMAGE, pageUrl, SITE_NAME } from '#/lib/seo';

/** schema.org `Article` markup for a guide page (same data as the visible page). */
export function buildArticleJsonLd(guide: Guide): Record<string, unknown> {
  const { title, description, date, updated } = guide.frontmatter;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    datePublished: date,
    dateModified: updated ?? date,
    mainEntityOfPage: pageUrl(guidePath(guide.slug)),
    image: OG_IMAGE,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: pageUrl('/') },
  };
}

/** XML text/attribute escape. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

interface SitemapPage {
  path: string;
  changefreq: 'monthly' | 'yearly';
  priority: number;
}

/**
 * The static pages in `/sitemap.xml` (it used to be a hand-written file in
 * `public/`). Guides are added from the content folder, so only a page that
 * is not a guide needs a line here.
 */
export const STATIC_SITEMAP_PAGES: readonly SitemapPage[] = [
  { path: '/', changefreq: 'monthly', priority: 1.0 },
  { path: '/features', changefreq: 'monthly', priority: 0.9 },
  { path: '/pricing', changefreq: 'monthly', priority: 0.8 },
  { path: '/guides', changefreq: 'monthly', priority: 0.8 },
  { path: '/features/tracking', changefreq: 'monthly', priority: 0.7 },
  { path: '/features/ai-assistant', changefreq: 'monthly', priority: 0.7 },
  { path: '/features/resume-cover-letter', changefreq: 'monthly', priority: 0.7 },
  { path: '/features/analytics', changefreq: 'monthly', priority: 0.7 },
  { path: '/register', changefreq: 'monthly', priority: 0.8 },
  { path: '/login', changefreq: 'monthly', priority: 0.5 },
  { path: '/forgot-password', changefreq: 'yearly', priority: 0.1 },
  { path: '/privacy', changefreq: 'yearly', priority: 0.3 },
  { path: '/terms', changefreq: 'yearly', priority: 0.3 },
  { path: '/accessibility', changefreq: 'yearly', priority: 0.1 },
];

export function buildSitemap(guides: readonly Guide[]): string {
  const entries = [
    ...STATIC_SITEMAP_PAGES.map(
      (p) =>
        `  <url>\n    <loc>${escapeXml(pageUrl(p.path))}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`,
    ),
    ...guides.map(
      (g) =>
        `  <url>\n    <loc>${escapeXml(pageUrl(guidePath(g.slug)))}</loc>\n    <lastmod>${g.frontmatter.updated ?? g.frontmatter.date}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

export const RSS_TITLE = `${SITE_NAME} Guides`;
export const RSS_DESCRIPTION = 'How-to guides for tracking your job search with Trakwyn.';

export function buildRss(guides: readonly Guide[]): string {
  const items = guides.map((g) => {
    const url = escapeXml(pageUrl(guidePath(g.slug)));
    return [
      '    <item>',
      `      <title>${escapeXml(g.frontmatter.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${new Date(`${g.frontmatter.date}T00:00:00Z`).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(g.frontmatter.description)}</description>`,
      ...g.frontmatter.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(RSS_TITLE)}</title>`,
    `    <link>${escapeXml(pageUrl('/guides'))}</link>`,
    `    <description>${escapeXml(RSS_DESCRIPTION)}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${escapeXml(pageUrl('/guides/rss.xml'))}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
