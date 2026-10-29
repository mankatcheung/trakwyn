import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, cachingProvider } from '#src/evals/responseCache.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const messages = [{ role: 'user' as const, content: 'hello' }];

describe('cacheKey', () => {
  it('is stable for the same request and differs when any part changes', () => {
    const base = cacheKey('openai:m', messages, 10, { json: true });

    expect(cacheKey('openai:m', messages, 10, { json: true })).toBe(base);
    expect(cacheKey('openai:other', messages, 10, { json: true })).not.toBe(base);
    expect(
      cacheKey('openai:m', [{ role: 'user', content: 'hello!' }], 10, { json: true }),
    ).not.toBe(base);
    expect(cacheKey('openai:m', messages, 11, { json: true })).not.toBe(base);
    expect(cacheKey('openai:m', messages, 10, undefined)).not.toBe(base);
  });
});

describe('cachingProvider', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-cache-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('calls the provider once and serves the repeat from disk, usage included', async () => {
    const inner = makeLLMProvider('{}');
    vi.mocked(inner.complete).mockResolvedValue({
      content: 'answer',
      usage: { promptTokens: 7, completionTokens: 3 },
      truncated: false,
    });
    const cached = cachingProvider(inner, { dir, namespace: 'openai:m', refresh: false });

    const first = await cached.complete(messages, 10, undefined, { json: true });
    const second = await cached.complete(messages, 10, undefined, { json: true });

    expect(inner.complete).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second.usage).toEqual({ promptTokens: 7, completionTokens: 3 });
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it('survives a new provider instance, which is the point of caching on disk', async () => {
    const inner = makeLLMProvider('one');
    await cachingProvider(inner, { dir, namespace: 'n', refresh: false }).complete(messages);
    const other = makeLLMProvider('two');

    const result = await cachingProvider(other, { dir, namespace: 'n', refresh: false }).complete(
      messages,
    );

    expect(result.content).toBe('one');
    expect(other.complete).not.toHaveBeenCalled();
  });

  it('with refresh, ignores what is stored and overwrites it', async () => {
    await cachingProvider(makeLLMProvider('old'), {
      dir,
      namespace: 'n',
      refresh: false,
    }).complete(messages);
    const fresh = makeLLMProvider('new');

    const result = await cachingProvider(fresh, { dir, namespace: 'n', refresh: true }).complete(
      messages,
    );
    const afterwards = await cachingProvider(makeLLMProvider('unused'), {
      dir,
      namespace: 'n',
      refresh: false,
    }).complete(messages);

    expect(result.content).toBe('new');
    expect(afterwards.content).toBe('new');
  });

  it('does not cache a failure', async () => {
    const inner = makeLLMProvider('ok');
    vi.mocked(inner.complete).mockRejectedValueOnce(new Error('503'));
    const cached = cachingProvider(inner, { dir, namespace: 'n', refresh: false });

    await expect(cached.complete(messages)).rejects.toThrow('503');
    const retry = await cached.complete(messages);

    expect(retry.content).toBe('ok');
  });

  it('treats an unreadable cache file as a miss rather than failing the run', async () => {
    const inner = makeLLMProvider('fresh');
    const cached = cachingProvider(inner, { dir, namespace: 'n', refresh: false });
    await cached.complete(messages);
    const [file] = readdirSync(dir);
    writeFileSync(join(dir, file as string), '{ not json');

    const result = await cached.complete(messages);

    expect(result.content).toBe('fresh');
    expect(inner.complete).toHaveBeenCalledTimes(2);
  });
});
