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
        neurons: null,
        reasoningReturned: null,
        estimated: false,
        // (10 × 150 000 + 5 × 600 000) / 1 000 000 = 4.5, rounded.
        costMicros: 5,
        feature: 'chat',
        promptVersion: null,
        source: 'byok',
      });
    });

    it('records the version of the prompt the call sent (JEF-505)', async () => {
      const inner = makeInner({
        complete: vi
          .fn()
          .mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        feature: AI_FEATURE.COVER_LETTER,
        promptVersion: 3,
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

      await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(usageEventRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'coverLetter', promptVersion: 3 }),
      );
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
        neurons: null,
        reasoningReturned: null,
        estimated: false,
        // No model on the key: priced as Anthropic's default, Haiku 4.5.
        costMicros: 60,
        feature: 'chat',
        promptVersion: null,
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

  describe('neurons and reasoning output (JEF-497)', () => {
    const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
    // 1M prompt + 1M completion tokens on Gemma is 400_000 micro-USD by the price table.
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000 };

    function build(opts: {
      source: 'platform' | 'byok';
      usage: object | null;
      model?: string;
      metrics?: ReturnType<typeof makeFakeMetrics>;
      logger?: ReturnType<typeof makeLogger>;
      stream?: boolean;
    }) {
      const repo = makeRepo();
      const metrics = opts.metrics ?? makeFakeMetrics();
      const logger = opts.logger ?? makeLogger();
      const provider = new UsageTrackingLLMProvider({
        inner: makeInner({
          complete: vi.fn().mockResolvedValue({ content: 'ok', usage: opts.usage }),
          completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
            yield { type: 'text_delta', text: 'partial' };
            if (!opts.stream) return;
            yield { type: 'done', content: 'ok', toolCalls: [], usage: opts.usage as never };
          }),
        }),
        usageEventRepository: repo,
        logger,
        generateId: () => 'evt',
        userId: 'user-1',
        provider: opts.source === 'platform' ? 'workersai' : 'openai',
        model: opts.model ?? GEMMA,
        feature: AI_FEATURE.CHAT,
        source: opts.source,
        metrics,
      });
      return { provider, repo, metrics, logger };
    }

    const msgs = [{ role: 'user' as const, content: 'hi' }];

    it('stores neurons and reasoningReturned on a platform event', async () => {
      const { provider, repo } = build({
        source: 'platform',
        usage: { ...usage, neurons: 36_000, reasoningReturned: true },
      });

      await provider.complete(msgs);

      expect(repo.record).toHaveBeenCalledWith(
        expect.objectContaining({ neurons: 36_000, reasoningReturned: true }),
      );
    });

    it('reads a finished platform call with no reasoning text as reasoningReturned = false', async () => {
      const { provider, repo } = build({ source: 'platform', usage });

      await provider.complete(msgs);

      expect(repo.record).toHaveBeenCalledWith(
        expect.objectContaining({ neurons: null, reasoningReturned: false }),
      );
    });

    it('records no reasoningReturned off the platform path', async () => {
      const { provider, repo } = build({
        source: 'byok',
        model: 'gpt-4o-mini',
        usage: { promptTokens: 10, completionTokens: 5, reasoningReturned: true },
      });

      await provider.complete(msgs);

      expect(repo.record).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningReturned: null, neurons: null }),
      );
    });

    it('records no reasoningReturned for a stream cut off before it finished', async () => {
      const { provider, repo } = build({ source: 'platform', usage: null, stream: false });

      await drain(provider.completeWithToolsStream(msgs, []));

      expect(repo.record).toHaveBeenCalledWith(
        expect.objectContaining({ estimated: true, reasoningReturned: null }),
      );
    });

    it('counts the neurons-based cost and stays quiet when it agrees with the estimate', async () => {
      // 400_000 micro-USD / 11 per neuron ≈ 36_364 neurons.
      const { provider, metrics, logger } = build({
        source: 'platform',
        usage: { ...usage, neurons: 36_364 },
      });

      await provider.complete(msgs);

      expect(metrics.llmNeuronCosts).toEqual([
        { model: GEMMA, feature: 'chat', costMicros: 400_004 },
      ]);
      expect(metrics.llmCostMismatches).toEqual([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flags a mismatch, with a direction, when Cloudflare billed far more than the table says', async () => {
      const { provider, metrics, logger } = build({
        source: 'platform',
        usage: { ...usage, neurons: 72_000 },
      });

      await provider.complete(msgs);

      expect(metrics.llmCostMismatches).toEqual([{ model: GEMMA, direction: 'under' }]);
      expect(logger.warn).toHaveBeenCalledWith(
        'llm.cost_mismatch',
        undefined,
        expect.objectContaining({ estimateMicros: 400_000, neuronMicros: 792_000 }),
      );
    });

    it('flags the other direction when the table is the higher number', async () => {
      const { provider, metrics } = build({
        source: 'platform',
        usage: { ...usage, neurons: 10_000 },
      });

      await provider.complete(msgs);

      expect(metrics.llmCostMismatches).toEqual([{ model: GEMMA, direction: 'over' }]);
    });

    it('ignores a gap on a tiny call', async () => {
      const { provider, metrics } = build({
        source: 'platform',
        usage: { promptTokens: 100, completionTokens: 100, neurons: 3 },
      });

      await provider.complete(msgs);

      expect(metrics.llmCostMismatches).toEqual([]);
    });

    it('does no neuron accounting for a call with no neurons, or off the platform path', async () => {
      const platform = build({ source: 'platform', usage });
      const byok = build({
        source: 'byok',
        model: 'gpt-4o-mini',
        usage: { promptTokens: 10, completionTokens: 5, neurons: 99_999 },
      });

      await platform.provider.complete(msgs);
      await byok.provider.complete(msgs);

      expect(platform.metrics.llmNeuronCosts).toEqual([]);
      expect(byok.metrics.llmNeuronCosts).toEqual([]);
      expect(byok.metrics.llmCostMismatches).toEqual([]);
    });
  });
});
