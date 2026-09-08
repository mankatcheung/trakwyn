import { describe, it, expect, vi } from 'vitest';
import { GetLlmUsageSummaryUseCase } from '#src/use-cases/user/GetLlmUsageSummaryUseCase.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';

const summaryFor = (promptTokens: number, completionTokens: number, provider = 'openai') => [
  {
    provider,
    requestCount: 2,
    promptTokens,
    completionTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    lastUsedAt: new Date('2026-03-15T00:00:00.000Z'),
  },
];

const build = (
  summaries: ReturnType<typeof summaryFor>,
  keys: ReturnType<typeof makeLlmApiKey>[],
) =>
  new GetLlmUsageSummaryUseCase({
    llmUsageEventRepository: makeLlmUsageEventRepository({
      summarizeByUserId: vi.fn().mockResolvedValue(summaries),
    }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findAllByUserId: vi.fn().mockResolvedValue(keys),
    }),
    now: () => new Date('2026-03-15T12:34:56.000Z'),
  });

describe('GetLlmUsageSummaryUseCase', () => {
  it('passes the start of the current UTC month as the cutoff', async () => {
    const llmUsageEventRepository = makeLlmUsageEventRepository({
      summarizeByUserId: vi.fn().mockResolvedValue([]),
    });

    await new GetLlmUsageSummaryUseCase({
      llmUsageEventRepository,
      llmApiKeyRepository: makeLlmApiKeyRepository(),
      now: () => new Date('2026-03-15T12:34:56.000Z'),
    }).execute('user-1');

    expect(llmUsageEventRepository.summarizeByUserId).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-03-01T00:00:00.000Z'),
    );
  });

  it('carries the counts through unchanged', async () => {
    const [row] = await build(summaryFor(100, 40), []).execute('user-1');

    expect(row).toMatchObject({ provider: 'openai', requestCount: 2, promptTokens: 100 });
  });

  it('reports no limit when the key has none', async () => {
    const keys = [makeLlmApiKey({ provider: 'openai', monthlyTokenLimit: null })];

    const [row] = await build(summaryFor(100, 40), keys).execute('user-1');

    expect(row).toMatchObject({ monthlyTokenLimit: null, limitReached: false });
  });

  it('reports the limit as not reached while usage is below it', async () => {
    const keys = [makeLlmApiKey({ provider: 'openai', monthlyTokenLimit: 200 })];

    const [row] = await build(summaryFor(100, 99), keys).execute('user-1');

    expect(row).toMatchObject({ monthlyTokenLimit: 200, limitReached: false });
  });

  /** Prompt and completion tokens both count — the limit is on the pair. */
  it('reports the limit as reached once the combined tokens meet it', async () => {
    const keys = [makeLlmApiKey({ provider: 'openai', monthlyTokenLimit: 200 })];

    const [row] = await build(summaryFor(100, 100), keys).execute('user-1');

    expect(row).toMatchObject({ monthlyTokenLimit: 200, limitReached: true });
  });

  it('reports the limit as reached when a turn overshot it', async () => {
    const keys = [makeLlmApiKey({ provider: 'openai', monthlyTokenLimit: 200 })];

    const [row] = await build(summaryFor(400, 0), keys).execute('user-1');

    expect(row).toMatchObject({ limitReached: true });
  });

  /**
   * Usage can outlive the key it was spent on — the events are not deleted
   * when a key is removed, so a summary row with no matching key is normal.
   */
  it('reports no limit for usage whose key is gone', async () => {
    const keys = [makeLlmApiKey({ provider: 'anthropic', monthlyTokenLimit: 10 })];

    const [row] = await build(summaryFor(100, 40, 'openai'), keys).execute('user-1');

    expect(row).toMatchObject({ provider: 'openai', monthlyTokenLimit: null, limitReached: false });
  });
});
