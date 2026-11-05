import { describe, it, expect, vi } from 'vitest';
import {
  OrderedFallbackLLMProvider,
  type FallbackLeg,
} from '#src/infrastructure/llm/OrderedFallbackLLMProvider.js';
import { LlmProviderError, type LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const failing = (kind: LlmProviderErrorKind): ILLMProvider => {
  const err = new LlmProviderError(kind, { provider: 'OpenAI', status: 500 });
  return {
    complete: vi.fn().mockRejectedValue(err),
    completeWithToolsStream: vi.fn(async function* () {
      throw err;
    }),
  };
};

/** Hands out the given legs one at a time, then null. */
const legs = (...list: FallbackLeg[]) => {
  const queue = [...list];
  return vi.fn(async () => queue.shift() ?? null);
};

const leg = (
  entry: string,
  provider: ILLMProvider = makeLLMProvider(`from ${entry}`),
): FallbackLeg => ({
  entry,
  provider,
});

async function collect(provider: ILLMProvider, signal?: AbortSignal) {
  const events: LLMStreamEvent[] = [];
  for await (const e of provider.completeWithToolsStream([], [], undefined, signal)) events.push(e);
  return events;
}

describe('OrderedFallbackLLMProvider', () => {
  describe('complete', () => {
    it.each(['rate_limited', 'unavailable', 'unreachable', 'auth', 'quota'] as const)(
      'moves to the next provider in the order on %s',
      async (kind) => {
        const next = legs(leg('anthropic'));
        const provider = new OrderedFallbackLLMProvider(failing(kind), 'openai', next);

        const result = await provider.complete([]);

        expect(result.content).toBe('from anthropic');
        expect(next).toHaveBeenCalledTimes(1);
      },
    );

    it('does not move on when the request itself was refused', async () => {
      const next = legs(leg('anthropic'));
      const provider = new OrderedFallbackLLMProvider(failing('bad_request'), 'openai', next);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'bad_request' });
      expect(next).not.toHaveBeenCalled();
    });

    it('does not move on for an error that is not a provider error', async () => {
      const broken: ILLMProvider = {
        complete: vi.fn().mockRejectedValue(new Error('boom')),
        completeWithToolsStream: vi.fn(),
      };
      const next = legs(leg('anthropic'));

      await expect(
        new OrderedFallbackLLMProvider(broken, 'openai', next).complete([]),
      ).rejects.toThrow('boom');
      expect(next).not.toHaveBeenCalled();
    });

    it('does not move on when the caller cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      const next = legs(leg('anthropic'));
      const provider = new OrderedFallbackLLMProvider(failing('unavailable'), 'openai', next);

      await expect(provider.complete([], undefined, controller.signal)).rejects.toBeInstanceOf(
        LlmProviderError,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('keeps going down the order while providers keep failing, then answers on the one that works', async () => {
      const next = legs(leg('anthropic', failing('rate_limited')), leg('groq'));
      const provider = new OrderedFallbackLLMProvider(failing('unavailable'), 'openai', next);

      expect((await provider.complete([])).content).toBe('from groq');
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('fails with the last provider’s own error once the order is used up', async () => {
      const next = legs(leg('anthropic', failing('rate_limited')));
      const provider = new OrderedFallbackLLMProvider(failing('unavailable'), 'openai', next);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'rate_limited' });
    });

    it('asks for the next provider only when one is needed', async () => {
      const next = legs(leg('anthropic'));
      const provider = new OrderedFallbackLLMProvider(makeLLMProvider('primary'), 'openai', next);

      expect((await provider.complete([])).content).toBe('primary');
      expect(next).not.toHaveBeenCalled();
    });

    it('reports each switch with the entries it moved between', async () => {
      const onFallback = vi.fn();
      const provider = new OrderedFallbackLLMProvider(
        failing('unavailable'),
        'openai',
        legs(leg('trakwyn')),
        onFallback,
      );

      await provider.complete([]);

      expect(onFallback).toHaveBeenCalledWith('openai', 'trakwyn', expect.any(LlmProviderError));
    });
  });

  describe('completeWithToolsStream', () => {
    it('switches before any output and says so in the stream, ahead of the new provider’s events', async () => {
      const provider = new OrderedFallbackLLMProvider(
        failing('unavailable'),
        'openai',
        legs(leg('trakwyn')),
      );

      const events = await collect(provider);

      expect(events[0]).toEqual({ type: 'fallback', from: 'openai', to: 'trakwyn' });
      expect(events[events.length - 1]).toMatchObject({ type: 'done', content: 'from trakwyn' });
    });

    it('does not switch once it has handed the caller an event', async () => {
      const midStream: ILLMProvider = {
        complete: vi.fn(),
        completeWithToolsStream: vi.fn(async function* () {
          yield { type: 'text_delta', text: 'Hel' } as const;
          throw new LlmProviderError('unavailable');
        }),
      };
      const next = legs(leg('anthropic'));
      const provider = new OrderedFallbackLLMProvider(midStream, 'openai', next);

      const seen: LLMStreamEvent[] = [];
      await expect(
        (async () => {
          for await (const e of provider.completeWithToolsStream([], [])) seen.push(e);
        })(),
      ).rejects.toBeInstanceOf(LlmProviderError);

      expect(seen).toEqual([{ type: 'text_delta', text: 'Hel' }]);
      expect(next).not.toHaveBeenCalled();
    });

    it('stays on the provider it switched to for the next call, so one chat turn does not retry the failed one', async () => {
      const primary = failing('unavailable');
      const second = makeLLMProvider('from trakwyn');
      const next = legs(leg('trakwyn', second));
      const provider = new OrderedFallbackLLMProvider(primary, 'openai', next);

      await collect(provider);
      const again = await collect(provider);

      expect(primary.completeWithToolsStream).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledTimes(1);
      expect(again.some((e) => e.type === 'fallback')).toBe(false);
    });

    it('fails with the provider’s own error when nothing is left', async () => {
      const provider = new OrderedFallbackLLMProvider(failing('auth'), 'openai', legs());

      await expect(collect(provider)).rejects.toMatchObject({ kind: 'auth' });
    });
  });
});
