import { createFileRoute } from '@tanstack/react-router';
import { buildRss } from '#/lib/guideFeeds';
import { GUIDES } from '#/lib/guides';

export const Route = createFileRoute('/guides/rss.xml')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildRss(GUIDES), {
          headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
        }),
    },
  },
});
