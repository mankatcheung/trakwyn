import type {
  IWebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
} from '#src/use-cases/ports/IWebSearchProvider.js';

/**
 * Fixed results with no network (JEF-538): local dev, CI and e2e never reach
 * a live search API. A `news` query answers with one dated result and a
 * `general` query with one undated review, so both shapes are exercised.
 */
export class FakeWebSearchProvider implements IWebSearchProvider {
  async search({ topic, query }: WebSearchQuery): Promise<WebSearchResult[]> {
    const slug = encodeURIComponent(query.slice(0, 40).toLowerCase().replace(/\s+/g, '-'));
    return topic === 'news'
      ? [
          {
            url: `https://news.example.test/${slug}`,
            title: 'Fake news: the company raises a round',
            snippet:
              'The company announced a funding round this spring, according to a fake report.',
            publishedAt: '2026-03-12T00:00:00.000Z',
          },
        ]
      : [
          {
            url: `https://reviews.example.test/${slug}`,
            title: 'Fake reviews: working at the company',
            snippet: 'Employees in this fake review describe a small, flat team.',
            publishedAt: null,
          },
        ];
  }
}
