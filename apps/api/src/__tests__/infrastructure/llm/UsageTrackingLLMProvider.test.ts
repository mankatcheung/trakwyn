import { describe, it, expect, vi } from 'vitest';
import { UsageTrackingLLMProvider } from '#src/infrastructure/llm/UsageTrackingLLMProvider.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { AI_FEATURE, LLM_USAGE_SOURCE } from '#src/use-cases/constants.js';
import { noopMetrics } from '#src/infrastructure/observability/metrics.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { resetPriceUnknownWarnings } from '#src/infrastructure/llm/estimateCostMicros.js';

function makeInner(overrides?: Partial<ILLMProvider>): ILLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: 'ok', usage: null }),
    completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
      yield { type: 'done', content: 'ok', toolCalls: [], usage: null };
    }),
    ...overrides,
  };
}

async function drain(stream: AsyncGenerator<LLMStreamEvent>): Promise<void> {
  for await (const event of stream) void event;
}

function makeRepo(overrides?: Partial<ILlmUsageEventRepository>): ILlmUsageEventRepository {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    summarizeByUserId: vi.fn().mockResolvedValue([]),
    sumCostMicros: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('UsageTrackingLLMProvider', () => {
  describe('complete', () => {
    it('records a usage event when the inner provider reports usage', async () => {
      const inner = makeInner({
        complete: vi
          .fn()
          .mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
      });

      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('ok');
      expect(usageEventRepository.record).toHaveBeenCalledWith({
        id: 'evt-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
        promptTokens: 10,
        completionTokens: 5,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        estimated: false,
        // (10 × 150 000 + 5 × 600 000) / 1 000 000 = 4.5, rounded.
        costMicros: 5,
        feature: 'chat',
        source: 'byok',
      });
    });

    it('records reasoningTokens and forwards the per-call options (JEF-445)', async () => {
      const inner = makeInner({
        complete: vi.fn().mockResolvedValue({
          content: 'ok',
          usage: { promptTokens: 10, completionTokens: 50, reasoningTokens: 40 },
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-1',
        userId: 'user-1',
        provider: 'googleai',
        model: null,
      });

      await provider.complete([{ role: 'user', content: 'hi' }], 256, undefined, {
        reasoning: 'off',
      });
      await drain(
        provider.completeWithToolsStream([{ role: 'user', content: 'hi' }], [], 256, undefined, {
          reasoning: 'off',
        }),
      );

      expect(usageEventRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningTokens: 40 }),
      );
      expect(inner.complete).toHaveBeenCalledWith(expect.anything(), 256, undefined, {
        reasoning: 'off',
      });
      expect(inner.completeWithToolsStream).toHaveBeenCalledWith(
        expect.anything(),
        [],
        256,
        undefined,
        { reasoning: 'off' },
      );
    });

    it('puts the hosted tier on the cost metric (JEF-448)', async () => {
      const metrics = makeFakeMetrics();
      await new UsageTrackingLLMProvider({
        inner: makeInner({
          complete: vi.fn().mockResolvedValue({
            content: 'ok',
            usage: { promptTokens: 1_000, completionTokens: 0 },
          }),
        }),
        usageEventRepository: makeRepo(),
        logger: makeLogger(),
        generateId: () => 'evt',
        userId: 'user-1',
        provider: 'googleai',
        model: 'gemini-2.5-flash-lite',
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.PLATFORM,
        tier: 'lite',
        metrics,
      }).complete([{ role: 'user', content: 'hi' }]);

      expect(metrics.llmCosts).toEqual([
        expect.objectContaining({ tier: 'lite', costMicros: 100 }),
      ]);
    });

    it('counts the cost in the metric, and records null with one warning for an unpriced model (JEF-444)', async () => {
      resetPriceUnknownWarnings();
      const complete = vi
        .fn()
        .mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } });
      const metrics = makeFakeMetrics();
      const logger = makeLogger();
      const usageEventRepository = makeRepo();
      const build = (model: string) =>
        new UsageTrackingLLMProvider({
          inner: makeInner({ complete }),
          usageEventRepository,
          logger,
          generateId: () => 'evt',
          userId: 'user-1',
          provider: 'openai',
          model,
          feature: AI_FEATURE.COVER_LETTER,
          source: LLM_USAGE_SOURCE.BYOK,
          metrics,
        });

      await build('gpt-4o-mini').complete([{ role: 'user', content: 'hi' }]);
      await build('gpt-unlisted').complete([{ role: 'user', content: 'hi' }]);
      await build('gpt-unlisted').complete([{ role: 'user', content: 'hi' }]);

      expect(metrics.llmCosts).toEqual([
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          feature: 'coverLetter',
          source: 'byok',
          costMicros: 5,
        },
      ]);
      expect(usageEventRepository.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ costMicros: null, feature: 'coverLetter' }),
      );
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('records nothing when the inner provider reports no usage', async () => {
      const inner = makeInner();
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-1',
        userId: 'user-1',
        provider: 'openai',
        model: null,
      });

      await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(usageEventRepository.record).not.toHaveBeenCalled();
    });

    it('fails open — a usage-recording error never surfaces to the caller', async () => {
      const inner = makeInner({
        complete: vi
          .fn()
          .mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } }),
      });
      const usageEventRepository = makeRepo({
        record: vi.fn().mockRejectedValue(new Error('db down')),
      });
      const logger = makeLogger();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger,
        generateId: () => 'evt-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
      });

      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('ok');
      // Through the injected logger, not console.error (JEF-351) — a
      // swallowed usage write is precisely the kind of thing that has to be
      // visible in Axiom next to the request it happened in.
      expect(logger.error).toHaveBeenCalledWith(
        '[llm-usage] failed to record usage event — continuing',
        expect.any(Error),
      );
    });
  });

  describe('completeWithToolsStream', () => {
    it('records a usage event from the done event and still yields every event', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'text_delta', text: 'hi' };
          yield {
            type: 'done',
            content: 'hi',
            toolCalls: [],
            usage: { promptTokens: 20, completionTokens: 8 },
          };
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-2',
        userId: 'user-1',
        provider: 'anthropic',
        model: null,
      });

      const events = [];
      for await (const event of provider.completeWithToolsStream(
        [{ role: 'user', content: 'hi' }],
        [],
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(usageEventRepository.record).toHaveBeenCalledWith({
        id: 'evt-2',
        userId: 'user-1',
        provider: 'anthropic',
        model: null,
        promptTokens: 20,
        completionTokens: 8,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        reasoningTokens: null,
        estimated: false,
        // No model on the key: priced as Anthropic's default, Haiku 4.5.
        costMicros: 60,
        feature: 'chat',
        source: 'byok',
      });
    });

    it('charges the prompt when the stream ends without done (client aborted mid-reply) — S8', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'prompt_usage', promptTokens: 1234 };
          yield { type: 'text_delta', text: 'partial' };
          throw new DOMException('The operation was aborted.', 'AbortError');
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-3',
        userId: 'user-1',
        provider: 'anthropic',
        model: null,
      });

      const events: LLMStreamEvent[] = [];
      const err = await (async () => {
        for await (const event of provider.completeWithToolsStream(
          [{ role: 'user', content: 'hi' }],
          [],
        )) {
          events.push(event);
        }
      })().catch((e) => e);

      expect((err as Error).name).toBe('AbortError');
      expect(events).toEqual([
        { type: 'prompt_usage', promptTokens: 1234 },
        { type: 'text_delta', text: 'partial' },
      ]);
      expect(usageEventRepository.record).toHaveBeenCalledTimes(1);
      expect(usageEventRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ promptTokens: 1234, completionTokens: 0 }),
      );
    });

    it('does not double-count when done follows prompt_usage', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'prompt_usage', promptTokens: 20 };
          yield {
            type: 'done',
            content: 'hi',
            toolCalls: [],
            usage: { promptTokens: 20, completionTokens: 8 },
          };
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-4',
        userId: 'user-1',
        provider: 'anthropic',
        model: null,
      });

      await drain(provider.completeWithToolsStream([{ role: 'user', content: 'hi' }], []));

      expect(usageEventRepository.record).toHaveBeenCalledTimes(1);
      expect(usageEventRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ promptTokens: 20, completionTokens: 8 }),
      );
    });

    it('records an estimated prompt charge for an aborted stream whose provider never reported usage (F3)', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'text_delta', text: 'partial' };
          throw new Error('boom');
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-5',
        userId: 'user-1',
        provider: 'openai',
        model: null,
      });

      const messages = [{ role: 'user' as const, content: 'x'.repeat(400) }];
      await expect(provider.completeWithToolsStream(messages, []).next()).resolves.toMatchObject({
        value: { type: 'text_delta' },
      });
      await expect(drain(provider.completeWithToolsStream(messages, []))).rejects.toThrow('boom');

      expect(usageEventRepository.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ promptTokens: 100, completionTokens: 0, estimated: true }),
      );
    });

    it('records nothing when the stream failed before producing anything', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          throw new Error('401 before any event');
        }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.CHAT,
        source: LLM_USAGE_SOURCE.BYOK,
        metrics: noopMetrics,
        inner,
        usageEventRepository,
        logger: makeLogger(),
        generateId: () => 'evt-6',
        userId: 'user-1',
        provider: 'openai',
        model: null,
      });

      await expect(
        drain(provider.completeWithToolsStream([{ role: 'user', content: 'hi' }], [])),
      ).rejects.toThrow('401');
      expect(usageEventRepository.record).not.toHaveBeenCalled();
    });
  });
});
