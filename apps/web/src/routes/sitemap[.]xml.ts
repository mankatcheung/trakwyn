import { createFileRoute } from '@tanstack/react-router';
import { buildSitemap } from '#/lib/guideFeeds';
import { GUIDES } from '#/lib/guides';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildSitemap(GUIDES), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        }),
    },
  },
});
