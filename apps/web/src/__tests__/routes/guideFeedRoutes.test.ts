import { describe, expect, it } from 'vitest';
import { GUIDES } from '#/lib/guides';
import { Route as SitemapRoute } from '#/routes/sitemap[.]xml';
import { Route as RssRoute } from '#/routes/guides/rss[.]xml';

type Handler = () => Response;
function getHandler(route: unknown): Handler {
  const { options } = route as { options: { server: { handlers: { GET: Handler } } } };
  return options.server.handlers.GET;
}

describe('/sitemap.xml', () => {
  it('serves XML that lists every published guide', async () => {
    const response = getHandler(SitemapRoute)();
    expect(response.headers.get('Content-Type')).toContain('application/xml');
    const xml = await response.text();
    expect(GUIDES.length).toBeGreaterThan(0);
    for (const guide of GUIDES) {
      expect(xml).toContain(`https://www.trakwyn.com/guides/${guide.slug}</loc>`);
    }
  });
});

describe('/guides/rss.xml', () => {
  it('serves RSS that lists every published guide', async () => {
    const response = getHandler(RssRoute)();
    expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
    const xml = await response.text();
    for (const guide of GUIDES) {
      expect(xml).toContain(`<link>https://www.trakwyn.com/guides/${guide.slug}</link>`);
    }
  });
});
