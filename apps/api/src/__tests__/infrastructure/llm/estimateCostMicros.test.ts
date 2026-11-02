import { beforeEach, describe, expect, it } from 'vitest';
import {
  estimateCostMicros,
  resetPriceUnknownWarnings,
  warnPriceUnknownOnce,
} from '#src/infrastructure/llm/estimateCostMicros.js';
import { LLM_PRICES } from '#src/infrastructure/config/constants.js';
import { LLM, LLM_PROVIDER } from '#src/use-cases/constants.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('estimateCostMicros', () => {
  it('prices plain input and output', () => {
    // gpt-4o-mini: 150 000 in, 600 000 out per million.
    expect(
      estimateCostMicros(
        { promptTokens: 1_000_000, completionTokens: 1_000_000 },
        LLM_PROVIDER.OPENAI,
        'gpt-4o-mini',
      ),
    ).toBe(750_000);
  });

  it('bills cache reads at the cached rate and the rest of the prompt at the input rate', () => {
    // haiku-4-5: 1 000 000 in, 100 000 cached. 400k fresh + 600k cached.
    expect(
      estimateCostMicros(
        { promptTokens: 1_000_000, completionTokens: 0, cacheReadTokens: 600_000 },
        LLM_PROVIDER.ANTHROPIC,
        'claude-haiku-4-5',
      ),
    ).toBe(400_000 + 60_000);
  });

  it('bills cache writes at the write rate', () => {
    // 200k written at 1 250 000, 800k fresh at 1 000 000.
    expect(
      estimateCostMicros(
        { promptTokens: 1_000_000, completionTokens: 0, cacheWriteTokens: 200_000 },
        LLM_PROVIDER.ANTHROPIC,
        'claude-haiku-4-5',
      ),
    ).toBe(800_000 + 250_000);
  });

  it('prices reads, writes, fresh input and output together', () => {
    expect(
      estimateCostMicros(
        {
          promptTokens: 1_000_000,
          completionTokens: 100_000,
          cacheReadTokens: 500_000,
          cacheWriteTokens: 100_000,
        },
        LLM_PROVIDER.ANTHROPIC,
        'claude-haiku-4-5',
      ),
    ).toBe(400_000 + 50_000 + 125_000 + 500_000);
  });

  it('bills cached tokens as plain input when the model has no cache price', () => {
    // groq llama: 590 000 in, no cached rate.
    expect(
      estimateCostMicros(
        { promptTokens: 1_000_000, completionTokens: 0, cacheReadTokens: 900_000 },
        LLM_PROVIDER.GROQ,
        'llama-3.3-70b-versatile',
      ),
    ).toBe(590_000);
  });

  it('never goes negative when the cache split exceeds the prompt', () => {
    expect(
      estimateCostMicros(
        { promptTokens: 10, completionTokens: 0, cacheReadTokens: 50 },
        LLM_PROVIDER.ANTHROPIC,
        'claude-haiku-4-5',
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  it('prices a key with no model as its provider default', () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 0 };
    expect(estimateCostMicros(usage, LLM_PROVIDER.ANTHROPIC, null)).toBe(
      LLM_PRICES.anthropic[LLM.ANTHROPIC_DEFAULT_MODEL].input,
    );
  });

  it('rounds to a whole micro-dollar', () => {
    expect(
      Number.isInteger(
        estimateCostMicros(
          { promptTokens: 7, completionTokens: 3 },
          LLM_PROVIDER.OPENAI,
          'gpt-4o-mini',
        ),
      ),
    ).toBe(true);
  });

  it('returns null for an unknown model, an unknown provider and a custom endpoint', () => {
    const usage = { promptTokens: 1, completionTokens: 1 };
    expect(estimateCostMicros(usage, LLM_PROVIDER.OPENAI, 'gpt-nonexistent')).toBeNull();
    expect(estimateCostMicros(usage, 'nope', 'x')).toBeNull();
    expect(estimateCostMicros(usage, LLM_PROVIDER.CUSTOM, null)).toBeNull();
  });
});

describe('warnPriceUnknownOnce', () => {
  beforeEach(() => resetPriceUnknownWarnings());

  it('warns once per provider and model', () => {
    const logger = makeLogger();
    warnPriceUnknownOnce(logger, 'openai', 'm1');
    warnPriceUnknownOnce(logger, 'openai', 'm1');
    warnPriceUnknownOnce(logger, 'openai', 'm2');
    warnPriceUnknownOnce(logger, 'xai', 'm1');

    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'llm.price_unknown',
      undefined,
      expect.objectContaining({ provider: 'openai', model: 'm1' }),
    );
  });
});
