import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageTrackingLLMProvider } from '#src/infrastructure/llm/UsageTrackingLLMProvider.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';

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
    ...overrides,
  };
}

describe('UsageTrackingLLMProvider', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('complete', () => {
    it('records a usage event when the inner provider reports usage', async () => {
      const inner = makeInner({
        complete: vi
          .fn()
          .mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } }),
      });
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        inner,
        usageEventRepository,
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
        estimated: false,
      });
    });

    it('records nothing when the inner provider reports no usage', async () => {
      const inner = makeInner();
      const usageEventRepository = makeRepo();
      const provider = new UsageTrackingLLMProvider({
        inner,
        usageEventRepository,
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
      const provider = new UsageTrackingLLMProvider({
        inner,
        usageEventRepository,
        generateId: () => 'evt-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-4o-mini',
      });

      const result = await provider.complete([{ role: 'user', content: 'hi' }]);

      expect(result.content).toBe('ok');
      expect(consoleErrorSpy).toHaveBeenCalled();
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
        inner,
        usageEventRepository,
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
        estimated: false,
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
        inner,
        usageEventRepository,
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
        inner,
        usageEventRepository,
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
        inner,
        usageEventRepository,
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
        inner,
        usageEventRepository,
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
