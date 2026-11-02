import { describe, it, expect, vi } from 'vitest';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import {
  CachedParsedPostingStore,
  parsedPostingKey,
} from '#src/infrastructure/jobDescription/CachedParsedPostingStore.js';

describe('CachedParsedPostingStore', () => {
  it('parses once and serves the second caller from the cache', async () => {
    const store = new CachedParsedPostingStore({ cache: new MemoryCache(60_000) });
    const parse = vi.fn().mockResolvedValue({ role: 'Dev' });

    const first = await store.getOrParse('Senior Dev at Acme', parse);
    const second = await store.getOrParse('Senior Dev at Acme', parse);

    expect(first).toEqual({ value: { role: 'Dev' }, cached: false });
    expect(second).toEqual({ value: { role: 'Dev' }, cached: true });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('treats different whitespace as the same page and different text as another', async () => {
    const store = new CachedParsedPostingStore({ cache: new MemoryCache(60_000) });
    const parse = vi.fn().mockResolvedValue('x');

    await store.getOrParse('Senior   Dev\nat Acme', parse);
    await store.getOrParse(' Senior Dev at Acme ', parse);
    await store.getOrParse('Junior Dev at Acme', parse);

    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed parse', async () => {
    const store = new CachedParsedPostingStore({ cache: new MemoryCache(60_000) });
    await expect(
      store.getOrParse('page', vi.fn().mockRejectedValue(new Error('boom'))),
    ).rejects.toThrow('boom');

    const retry = await store.getOrParse('page', vi.fn().mockResolvedValue('ok'));
    expect(retry).toEqual({ value: 'ok', cached: false });
  });

  it('asks the cache to keep an entry for seven days', async () => {
    const getOrSet = vi.fn().mockImplementation((_k, fetch: () => Promise<unknown>) => fetch());
    const store = new CachedParsedPostingStore({
      cache: { getOrSet, delete: vi.fn(), deleteByPrefix: vi.fn() },
    });

    await store.getOrParse('page', async () => 1);

    expect(getOrSet).toHaveBeenCalledWith(
      parsedPostingKey('page'),
      expect.any(Function),
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it('keys on a hash, so the page text never appears in the key', () => {
    expect(parsedPostingKey('secret words')).toMatch(/^parsed-posting:v\d+:[0-9a-f]{64}$/);
  });
});
