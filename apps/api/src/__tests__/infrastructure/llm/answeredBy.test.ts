import { describe, it, expect, vi } from 'vitest';
import { UsageTrackingLLMProvider } from '#src/infrastructure/llm/UsageTrackingLLMProvider.js';
import { FailoverLLMProvider } from '#src/infrastructure/llm/FailoverLLMProvider.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { AI_FEATURE, LLM, LLM_USAGE_SOURCE } from '#src/use-cases/constants.js';
import { noopMetrics } from '#src/infrastructure/observability/metrics.js';

/**
 * Which provider and model wrote a reply (JEF-547). The usage tracker wraps
 * each leg of a failover, so the leg that answered is the one that reports.
 */
function tracked(
  inner: ILLMProvider,
  leg: {
    provider: string;
    model: string | null;
    tier?: 'lite' | 'mid';
    source?: 'byok' | 'platform';
  },
): UsageTrackingLLMProvider {
  return new UsageTrackingLLMProvider({
    inner,
    usageEventRepository: {
      record: vi.fn().mockResolvedValue(undefined),
      summarizeByUserId: vi.fn().mockResolvedValue([]),
      sumCostMicros: vi.fn().mockResolvedValue(0),
    },
    generateId: () => 'evt',
    logger: makeLogger(),
    userId: 'user-1',
    provider: leg.provider,
    model: leg.model,
    feature: AI_FEATURE.CHAT,
    promptVersion: 3,
    source: leg.source ?? LLM_USAGE_SOURCE.BYOK,
    tier: leg.tier,
    metrics: noopMetrics,
  });
}

const answering = (text: string): ILLMProvider => ({
  complete: vi.fn().mockResolvedValue({ content: text, usage: null }),
  completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
    yield { type: 'text_delta', text };
    yield { type: 'done', content: text, toolCalls: [], usage: null };
  }),
});

const down = (): ILLMProvider => ({
  complete: vi.fn().mockRejectedValue(new LlmProviderError('unavailable', { status: 503 })),

  completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
    throw new LlmProviderError('unavailable', { status: 503 });
  }),
});

async function lastDone(stream: AsyncGenerator<LLMStreamEvent>) {
  let done: Extract<LLMStreamEvent, { type: 'done' }> | undefined;
  for await (const event of stream) if (event.type === 'done') done = event;
  return done;
}

describe('answeredBy (JEF-547)', () => {
  it('stamps a completion with the provider, model and source that wrote it', async () => {
    const provider = tracked(answering('hi'), { provider: 'openai', model: 'gpt-test' });

    const result = await provider.complete([{ role: 'user', content: 'q' }]);

    expect(result.answeredBy).toEqual({ provider: 'openai', model: 'gpt-test', source: 'byok' });
  });

  it('names the provider default when the key chose no model', async () => {
    const provider = tracked(answering('hi'), { provider: 'openai', model: null });

    const result = await provider.complete([{ role: 'user', content: 'q' }]);

    expect(result.answeredBy?.model).toBe(LLM.OPENAI_DEFAULT_MODEL);
  });

  it('reports no model for a custom endpoint whose model is unknown', async () => {
    const provider = tracked(answering('hi'), { provider: 'custom', model: null });

    const result = await provider.complete([{ role: 'user', content: 'q' }]);

    expect(result.answeredBy?.model).toBeNull();
  });

  it('carries the hosted tier on a platform call', async () => {
    const provider = tracked(answering('hi'), {
      provider: 'workersai',
      model: '@cf/test',
      source: 'platform',
      tier: 'lite',
    });

    const result = await provider.complete([{ role: 'user', content: 'q' }]);

    expect(result.answeredBy).toEqual({
      provider: 'workersai',
      model: '@cf/test',
      source: 'platform',
      tier: 'lite',
    });
  });

  it('stamps the stream’s done event', async () => {
    const provider = tracked(answering('hi'), { provider: 'openai', model: 'gpt-test' });

    const done = await lastDone(provider.completeWithToolsStream([], []));

    expect(done?.answeredBy).toEqual({ provider: 'openai', model: 'gpt-test', source: 'byok' });
  });

  it('names the leg that answered after a failover, not the one tried first (stream)', async () => {
    const failover = new FailoverLLMProvider(
      tracked(down(), { provider: 'workersai', model: 'primary-model', source: 'platform' }),
      tracked(answering('hi'), { provider: 'google', model: 'fallback-model' }),
    );

    const done = await lastDone(failover.completeWithToolsStream([], []));

    expect(done?.answeredBy?.model).toBe('fallback-model');
    expect(done?.answeredBy?.provider).toBe('google');
  });

  it('names the leg that answered after a failover (complete)', async () => {
    const failover = new FailoverLLMProvider(
      tracked(down(), { provider: 'workersai', model: 'primary-model', source: 'platform' }),
      tracked(answering('hi'), { provider: 'google', model: 'fallback-model' }),
    );

    const result = await failover.complete([{ role: 'user', content: 'q' }]);

    expect(result.answeredBy?.model).toBe('fallback-model');
  });
});
