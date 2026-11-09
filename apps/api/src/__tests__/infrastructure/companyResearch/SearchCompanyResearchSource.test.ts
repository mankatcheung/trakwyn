import { describe, expect, it, vi } from 'vitest';
import { SearchCompanyResearchSource } from '#src/infrastructure/companyResearch/SearchCompanyResearchSource.js';
import { COMPANY_SEARCH } from '#src/infrastructure/config/constants.js';
import type {
  IWebSearchProvider,
  WebSearchResult,
} from '#src/use-cases/ports/IWebSearchProvider.js';

const NEWS: WebSearchResult = {
  url: 'https://news.example/acme',
  title: 'Acme raises Series B',
  snippet: 'Acme raised a Series B.',
  publishedAt: '2026-03-12T00:00:00.000Z',
};
const REVIEW: WebSearchResult = {
  url: 'https://reviews.example/acme',
  title: 'Acme reviews',
  snippet: 'A flat team.',
  publishedAt: null,
};

/** News results for a `news` query, review results for a `general` one. */
function provider(news: WebSearchResult[] = [NEWS], general: WebSearchResult[] = [REVIEW]) {
  const search = vi
    .fn()
    .mockImplementation(async ({ topic }: { topic: string }) =>
      topic === 'news' ? news : general,
    );
  return { search } satisfies IWebSearchProvider;
}

const query = { company: 'Acme', jobUrl: 'https://careers.acme.com/jobs/1' };

describe('SearchCompanyResearchSource', () => {
  it('makes a news search and a general search, news first, and returns both as pages', async () => {
    const searchProvider = provider();

    const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(searchProvider.search).toHaveBeenCalledTimes(2);
    expect(found?.pages).toEqual([
      {
        url: NEWS.url,
        title: NEWS.title,
        text: NEWS.snippet,
        publishedAt: '2026-03-12T00:00:00.000Z',
      },
      { url: REVIEW.url, title: REVIEW.title, text: REVIEW.snippet, publishedAt: null },
    ]);
  });

  it('asks for dated news over the configured window and a plain general search', async () => {
    const searchProvider = provider();

    await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(searchProvider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'news',
        days: COMPANY_SEARCH.NEWS_DAYS,
        maxResults: COMPANY_SEARCH.MAX_RESULTS,
      }),
    );
    const general = searchProvider.search.mock.calls
      .map(([q]) => q)
      .find((q) => q.topic === 'general');
    expect(general).not.toHaveProperty('days');
  });

  it('sends only the company name and the site host, never the posting path', async () => {
    const searchProvider = provider();

    await new SearchCompanyResearchSource({ searchProvider }).research({
      company: 'Acme',
      jobUrl: 'https://careers.acme.com/jobs/12345?token=secret&utm=x',
    });

    const queries = searchProvider.search.mock.calls.map(([q]) => q.query);
    expect(queries).toEqual([
      '"Acme" acme.com news funding layoffs',
      '"Acme" acme.com employee reviews culture',
    ]);
    expect(queries.join(' ')).not.toContain('secret');
    expect(queries.join(' ')).not.toContain('12345');
  });

  it('searches by name alone when the posting link says nothing about the company', async () => {
    const searchProvider = provider();

    await new SearchCompanyResearchSource({ searchProvider }).research({
      company: 'Acme',
      jobUrl: 'https://www.linkedin.com/jobs/view/123',
    });

    expect(searchProvider.search.mock.calls.map(([q]) => q.query)).toEqual([
      '"Acme" news funding layoffs',
      '"Acme" employee reviews culture',
    ]);
  });

  it('cleans the company name so it cannot add operators to the query', async () => {
    const searchProvider = provider();

    await new SearchCompanyResearchSource({ searchProvider }).research({
      company: 'Acme" OR site:evil.example "x\nline two',
      jobUrl: null,
    });

    const [first] = searchProvider.search.mock.calls[0];
    expect(first.query).toBe('"Acme OR site:evil.example x line two" news funding layoffs');
    expect(first.query.match(/"/g)).toHaveLength(2);
  });

  it('searches for nothing when the company name is empty', async () => {
    const searchProvider = provider();

    const found = await new SearchCompanyResearchSource({ searchProvider }).research({
      company: ' "" ',
      jobUrl: null,
    });

    expect(found).toBeNull();
    expect(searchProvider.search).not.toHaveBeenCalled();
  });

  it('keeps a result once when both searches return it', async () => {
    const searchProvider = provider([NEWS], [{ ...NEWS, publishedAt: null }, REVIEW]);

    const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(found?.pages.map((p) => p.url)).toEqual([NEWS.url, REVIEW.url]);
    expect(found?.pages[0].publishedAt).toBe('2026-03-12T00:00:00.000Z');
  });

  it('cuts a long snippet and a long title', async () => {
    const searchProvider = provider(
      [{ ...NEWS, snippet: 'x'.repeat(5_000), title: 'T'.repeat(500) }],
      [],
    );

    const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(found?.pages[0].text).toHaveLength(COMPANY_SEARCH.MAX_SNIPPET_CHARS);
    expect(found?.pages[0].title).toHaveLength(COMPANY_SEARCH.MAX_TITLE_CHARS);
  });

  it('titles a result by its host when it has no title', async () => {
    const searchProvider = provider([{ ...NEWS, title: '  ' }], []);

    const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(found?.pages[0].title).toBe('news.example');
  });

  it.each(['javascript:alert(1)', 'ftp://files.example/x', 'data:text/html,hi', 'not a url'])(
    'drops a result whose address is %s, since a source link opens only web addresses',
    async (url) => {
      const searchProvider = provider([{ ...NEWS, url }], []);

      const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

      expect(found).toBeNull();
    },
  );

  it('resolves null when nothing came back', async () => {
    const found = await new SearchCompanyResearchSource({
      searchProvider: provider([], []),
    }).research(query);

    expect(found).toBeNull();
  });

  it('uses the other search when one fails', async () => {
    const searchProvider: IWebSearchProvider = {
      search: vi.fn().mockImplementation(async ({ topic }: { topic: string }) => {
        if (topic === 'news') throw new Error('Tavily 500');
        return [REVIEW];
      }),
    };

    const found = await new SearchCompanyResearchSource({ searchProvider }).research(query);

    expect(found?.pages.map((p) => p.url)).toEqual([REVIEW.url]);
  });

  it('throws only when both searches fail, so a failure is not mistaken for no coverage', async () => {
    const searchProvider: IWebSearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Tavily 432')),
    };

    await expect(
      new SearchCompanyResearchSource({ searchProvider }).research(query),
    ).rejects.toThrow('Tavily 432');
  });
});
