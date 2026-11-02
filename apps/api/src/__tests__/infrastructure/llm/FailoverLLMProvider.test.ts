import { describe, it, expect, vi } from 'vitest';
import { FailoverLLMProvider } from '#src/infrastructure/llm/FailoverLLMProvider.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const unavailable = () =>
  new LlmProviderError('unavailable', { provider: 'Google AI', status: 503 });
const badRequest = () =>
  new LlmProviderError('bad_request', { provider: 'Google AI', status: 400 });

const failing = (err: Error): ILLMProvider => ({
  complete: vi.fn().mockRejectedValue(err),

  completeWithToolsStream: vi.fn(async function* () {
    throw err;
  }),
});

const done: LLMStreamEvent = { type: 'done', content: 'ok', toolCalls: [], usage: null };

async function collect(provider: ILLMProvider, signal?: AbortSignal) {
  const events: LLMStreamEvent[] = [];
  for await (const e of provider.completeWithToolsStream([], [], undefined, signal)) events.push(e);
  return events;
}

describe('FailoverLLMProvider', () => {
  describe('complete', () => {
    it('retries on the fallback when the primary is unavailable (503)', async () => {
      const fallback = makeLLMProvider('from fallback');
      const onFailover = vi.fn();
      const provider = new FailoverLLMProvider(failing(unavailable()), fallback, onFailover);

      const result = await provider.complete([]);

      expect(result.content).toBe('from fallback');
      expect(onFailover).toHaveBeenCalledTimes(1);
    });

    it('retries on the fallback when the primary is rate limited', async () => {
      const provider = new FailoverLLMProvider(
        failing(new LlmProviderError('rate_limited', { status: 429 })),
        makeLLMProvider('fb'),
      );

      expect((await provider.complete([])).content).toBe('fb');
    });

    it('does not fail over on a 400', async () => {
      const fallback = makeLLMProvider();
      const provider = new FailoverLLMProvider(failing(badRequest()), fallback);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'bad_request' });
      expect(fallback.complete).not.toHaveBeenCalled();
    });

    it('does not fail over on an error that is not a provider error', async () => {
      const fallback = makeLLMProvider();
      const provider = new FailoverLLMProvider(failing(new Error('boom')), fallback);

      await expect(provider.complete([])).rejects.toThrow('boom');
      expect(fallback.complete).not.toHaveBeenCalled();
    });

    it('does not fail over once the caller has cancelled', async () => {
      const fallback = makeLLMProvider();
      const controller = new AbortController();
      controller.abort();
      const provider = new FailoverLLMProvider(failing(unavailable()), fallback);

      await expect(provider.complete([], undefined, controller.signal)).rejects.toBeInstanceOf(
        LlmProviderError,
      );
      expect(fallback.complete).not.toHaveBeenCalled();
    });

    it('surfaces the fallback error when both fail, without a third try', async () => {
      const provider = new FailoverLLMProvider(
        failing(unavailable()),
        failing(new LlmProviderError('unavailable', { status: 502 })),
      );

      await expect(provider.complete([])).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('completeWithToolsStream', () => {
    it('retries on the fallback when the primary fails before any output', async () => {
      const provider = new FailoverLLMProvider(failing(unavailable()), makeLLMProvider('fb'));

      const events = await collect(provider);

      expect(events).toEqual([{ type: 'done', content: 'fb', toolCalls: [], usage: null }]);
    });

    it('does not fail over on a 400', async () => {
      const fallback = makeLLMProvider();
      const provider = new FailoverLLMProvider(failing(badRequest()), fallback);

      await expect(collect(provider)).rejects.toMatchObject({ kind: 'bad_request' });
      expect(fallback.completeWithToolsStream).not.toHaveBeenCalled();
    });

    it('does not fail over after output has started', async () => {
      const primary: ILLMProvider = {
        complete: vi.fn(),
        completeWithToolsStream: vi.fn(async function* () {
          yield { type: 'text_delta' as const, text: 'partial' };
          throw unavailable();
        }),
      };
      const fallback = makeLLMProvider();
      const provider = new FailoverLLMProvider(primary, fallback);
      const seen: LLMStreamEvent[] = [];

      await expect(
        (async () => {
          for await (const e of provider.completeWithToolsStream([], [])) seen.push(e);
        })(),
      ).rejects.toMatchObject({ kind: 'unavailable' });

      expect(seen).toEqual([{ type: 'text_delta', text: 'partial' }]);
      expect(fallback.completeWithToolsStream).not.toHaveBeenCalled();
    });

    it('passes a healthy primary through untouched', async () => {
      const primary: ILLMProvider = {
        complete: vi.fn(),
        completeWithToolsStream: vi.fn(async function* () {
          yield done;
        }),
      };
      const fallback = makeLLMProvider();

      const events = await collect(new FailoverLLMProvider(primary, fallback));

      expect(events).toEqual([done]);
      expect(fallback.completeWithToolsStream).not.toHaveBeenCalled();
    });
  });
});
