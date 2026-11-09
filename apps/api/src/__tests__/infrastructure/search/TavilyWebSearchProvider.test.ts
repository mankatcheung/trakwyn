import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TavilyWebSearchProvider,
  WebSearchError,
} from '#src/infrastructure/search/TavilyWebSearchProvider.js';
import { TAVILY } from '#src/infrastructure/config/constants.js';

const KEY = 'tvly-test-key';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn().mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const search = (overrides: Partial<Parameters<TavilyWebSearchProvider['search']>[0]> = {}) =>
  new TavilyWebSearchProvider({ apiKey: KEY }).search({
    query: '"Acme" news funding',
    topic: 'news',
    maxResults: 5,
    ...overrides,
  });

afterEach(() => vi.unstubAllGlobals());

describe('TavilyWebSearchProvider', () => {
  it('posts the query to Tavily with the key as a bearer token and basic depth', async () => {
    const fetchMock = stubFetch(json({ results: [] }));

    await search({ topic: 'general', maxResults: 3 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TAVILY.SEARCH_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({
      query: '"Acme" news funding',
      topic: 'general',
      search_depth: 'basic',
      max_results: 3,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_published_date: true,
    });
  });

  it.each([
    [1, 'day'],
    [7, 'week'],
    [30, 'month'],
    [365, 'year'],
  ])('asks a news search for the %i day window as time_range %s', async (days, timeRange) => {
    const fetchMock = stubFetch(json({ results: [] }));

    await search({ topic: 'news', days });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).time_range).toBe(timeRange);
  });

  it('sends no time range for a general search', async () => {
    const fetchMock = stubFetch(json({ results: [] }));

    await search({ topic: 'general', days: 365 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('time_range');
  });

  it('maps results to a url, title, snippet and ISO date', async () => {
    stubFetch(
      json({
        results: [
          {
            title: 'Acme raises Series B',
            url: 'https://news.example/acme',
            content: ' Acme raised a Series B. ',
            published_date: 'Thu, 12 Mar 2026 09:00:00 GMT',
            score: 0.9,
          },
        ],
      }),
    );

    await expect(search()).resolves.toEqual([
      {
        url: 'https://news.example/acme',
        title: 'Acme raises Series B',
        snippet: 'Acme raised a Series B.',
        publishedAt: '2026-03-12T09:00:00.000Z',
      },
    ]);
  });

  it('keeps a result with no date, or an unreadable one, as undated', async () => {
    stubFetch(
      json({
        results: [
          { title: 'A', url: 'https://a.example', content: 'text a' },
          { title: 'B', url: 'https://b.example', content: 'text b', published_date: 'soon' },
          { title: 'C', url: 'https://c.example', content: 'text c', published_date: null },
        ],
      }),
    );

    const results = await search();

    expect(results.map((r) => r.publishedAt)).toEqual([null, null, null]);
  });

  it('drops a result with no url or no snippet', async () => {
    stubFetch(
      json({
        results: [
          { title: 'no url', content: 'text' },
          { title: 'empty', url: 'https://empty.example', content: '   ' },
          { title: 'no content', url: 'https://nocontent.example' },
          { title: 'fine', url: 'https://fine.example', content: 'text' },
        ],
      }),
    );

    const results = await search();

    expect(results.map((r) => r.url)).toEqual(['https://fine.example']);
  });

  it('resolves an empty list when Tavily finds nothing', async () => {
    stubFetch(json({ results: [] }));

    await expect(search()).resolves.toEqual([]);
  });

  it.each([401, 429, 432, 433, 500])(
    'throws a WebSearchError carrying status %i',
    async (status) => {
      stubFetch(json({ detail: 'nope' }, status));

      const failure = await search().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(WebSearchError);
      expect((failure as WebSearchError).status).toBe(status);
    },
  );

  it('never puts the key or the query in an error message', async () => {
    stubFetch(json({}, 401));

    const failure = (await search().catch((error: unknown) => error)) as Error;

    expect(failure.message).not.toContain(KEY);
    expect(failure.message).not.toContain('Acme');
  });

  it('throws when the body is not JSON', async () => {
    stubFetch(new Response('<html>gateway</html>', { status: 200 }));

    await expect(search()).rejects.toBeInstanceOf(WebSearchError);
  });

  it('throws when there is no results list', async () => {
    stubFetch(json({ answer: 'x' }));

    await expect(search()).rejects.toBeInstanceOf(WebSearchError);
  });

  it('lets a network failure or timeout propagate', async () => {
    stubFetch(new Error('socket hang up'));

    await expect(search()).rejects.toThrow('socket hang up');
  });
});
