import { describe, it, expect, vi } from 'vitest';
import { CachedInterviewQuestionRepository } from '#src/infrastructure/db/repositories/CachedInterviewQuestionRepository.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { CACHE_KEYS } from '#src/infrastructure/config/constants.js';
import {
  makeInterviewQuestion,
  makeInterviewQuestionRepository,
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';

async function makeRepo() {
  const inner = makeInterviewQuestionRepository();
  const rounds = makeInterviewRoundRepository({
    findById: vi
      .fn()
      .mockResolvedValue(makeInterviewRound({ id: 'round-1', applicationId: 'app-1' })),
  });
  const cache = new MemoryCache(60_000);
  await cache.getOrSet(CACHE_KEYS.roundById('round-1'), async () => makeInterviewRound());
  await cache.getOrSet(CACHE_KEYS.roundList('app-1'), async () => [makeInterviewRound()]);
  const repo = new CachedInterviewQuestionRepository({
    drizzleInterviewQuestionRepository: inner,
    interviewRoundRepository: rounds,
    cache,
  });
  return { repo, inner, cache };
}

/** `ICache` has no plain read, so probe it: a hit never calls the fetcher. */
const isCached = async (cache: MemoryCache, key: string): Promise<boolean> => {
  const fetch = vi.fn().mockResolvedValue('refetched');
  await cache.getOrSet(key, fetch);
  return fetch.mock.calls.length === 0;
};

describe('CachedInterviewQuestionRepository', () => {
  it('drops the round caches after a question is created, so the count is fresh', async () => {
    const { repo, inner, cache } = await makeRepo();
    vi.mocked(inner.create).mockResolvedValue(makeInterviewQuestion());

    await repo.create({ id: 'question-1', interviewRoundId: 'round-1', question: 'Q' });

    expect(await isCached(cache, CACHE_KEYS.roundById('round-1'))).toBe(false);
    expect(await isCached(cache, CACHE_KEYS.roundList('app-1'))).toBe(false);
  });

  it('drops the round caches after a question is deleted', async () => {
    const { repo, inner, cache } = await makeRepo();
    vi.mocked(inner.findById).mockResolvedValue(makeInterviewQuestion());

    await repo.delete('question-1');

    expect(inner.delete).toHaveBeenCalledWith('question-1');
    expect(await isCached(cache, CACHE_KEYS.roundById('round-1'))).toBe(false);
    expect(await isCached(cache, CACHE_KEYS.roundList('app-1'))).toBe(false);
  });

  it('leaves the round caches alone for edits and reorders, which do not move the count', async () => {
    const { repo, inner, cache } = await makeRepo();
    vi.mocked(inner.update).mockResolvedValue(makeInterviewQuestion());

    await repo.update('question-1', { answer: 'A' });
    await repo.reorder('round-1', ['question-1']);

    expect(await isCached(cache, CACHE_KEYS.roundById('round-1'))).toBe(true);
    expect(await isCached(cache, CACHE_KEYS.roundList('app-1'))).toBe(true);
  });

  it('reads straight through to the inner repository', async () => {
    const { repo, inner } = await makeRepo();
    vi.mocked(inner.findAllByRoundId).mockResolvedValue([makeInterviewQuestion()]);
    vi.mocked(inner.findById).mockResolvedValue(makeInterviewQuestion());

    expect(await repo.findAllByRoundId('round-1')).toHaveLength(1);
    expect(await repo.findById('question-1')).not.toBeNull();
  });
});
