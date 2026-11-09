import { describe, expect, it } from 'vitest';
import { buildWebSearchProvider } from '#src/infrastructure/search/buildWebSearchProvider.js';
import { FakeWebSearchProvider } from '#src/infrastructure/search/FakeWebSearchProvider.js';
import { TavilyWebSearchProvider } from '#src/infrastructure/search/TavilyWebSearchProvider.js';

describe('buildWebSearchProvider', () => {
  it('is none when SEARCH_PROVIDER is unset, so search is opt-in', () => {
    expect(buildWebSearchProvider({})).toBeNull();
  });

  it('is none for `none` and for a value it does not know', () => {
    expect(buildWebSearchProvider({ SEARCH_PROVIDER: 'none' })).toBeNull();
    expect(buildWebSearchProvider({ SEARCH_PROVIDER: 'brave' })).toBeNull();
  });

  it('is Tavily when it is chosen and a key is set', () => {
    expect(
      buildWebSearchProvider({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'tvly-x' }),
    ).toBeInstanceOf(TavilyWebSearchProvider);
  });

  it.each([undefined, '', '   '])('is none for Tavily with the key %j', (key) => {
    expect(buildWebSearchProvider({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: key })).toBeNull();
  });

  it('is the fake, with no key, for `fake`', () => {
    expect(buildWebSearchProvider({ SEARCH_PROVIDER: 'fake' })).toBeInstanceOf(
      FakeWebSearchProvider,
    );
  });
});

describe('FakeWebSearchProvider', () => {
  it('answers a news search with one dated result and a general one with one undated', async () => {
    const fake = new FakeWebSearchProvider();

    const news = await fake.search({ query: 'Acme news', topic: 'news', maxResults: 5 });
    const general = await fake.search({ query: 'Acme reviews', topic: 'general', maxResults: 5 });

    expect(news).toHaveLength(1);
    expect(news[0].publishedAt).not.toBeNull();
    expect(general).toHaveLength(1);
    expect(general[0].publishedAt).toBeNull();
  });
});
