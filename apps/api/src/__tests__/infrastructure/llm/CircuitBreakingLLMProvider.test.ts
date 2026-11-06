import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreakingLLMProvider,
  classifyHostedFailure,
} from '#src/infrastructure/llm/CircuitBreakingLLMProvider.js';
import { CircuitBreaker } from '#src/infrastructure/resilience/CircuitBreaker.js';
import { LlmProviderError, type LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider, LLMStreamEvent } from '#src/use-cases/ports/ILLMProvider.js';

const usage = { promptTokens: 1, completionTokens: 1 };
const done: LLMStreamEvent = { type: 'done', content: 'ok', toolCalls: [], usage: null };
const delta: LLMStreamEvent = { type: 'text_delta', text: 'hi' } as LLMStreamEvent;

const providerError = (kind: LlmProviderErrorKind) => new LlmProviderError(kind, { status: 500 });
const timeout = () => new DOMException('The operation timed out', 'TimeoutError');
const fetchFailed = () => new TypeError('fetch failed');

function failingProvider(err: unknown): ILLMProvider {
  return {
    complete: vi.fn().mockRejectedValue(err),
    completeWithToolsStream: vi.fn(async function* () {
      throw err;
    }),
  };
}

function healthyProvider(): ILLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: 'ok', usage }),
    completeWithToolsStream: vi.fn(async function* () {
      yield delta;
      yield done;
    }),
  };
}

function build(inner: ILLMProvider, failureThreshold = 2) {
  const breaker = new CircuitBreaker({
    failureThreshold,
    cooldownMs: 1000,
    classifyError: classifyHostedFailure,
  });
  const onShortCircuit = vi.fn();
  const provider = new CircuitBreakingLLMProvider(inner, breaker, 'workersai', onShortCircuit);
  return { provider, breaker, onShortCircuit };
}

async function drain(provider: ILLMProvider, signal?: AbortSignal) {
  const events: LLMStreamEvent[] = [];
  for await (const e of provider.completeWithToolsStream([], [], undefined, signal)) events.push(e);
  return events;
}

describe('classifyHostedFailure', () => {
  it.each<[string, unknown, string]>([
    ['unavailable (5xx)', providerError('unavailable'), 'failure'],
    ['unreachable', providerError('unreachable'), 'failure'],
    ['a timeout', timeout(), 'failure'],
    ['an idle abort', new DOMException('aborted', 'AbortError'), 'failure'],
    ['fetch failed', fetchFailed(), 'failure'],
    ['a dropped stream', new TypeError('terminated'), 'failure'],
    ['a bad request', providerError('bad_request'), 'success'],
    ['an auth refusal', providerError('auth'), 'success'],
    ['no credit', providerError('quota'), 'success'],
    ['a rate limit', providerError('rate_limited'), 'success'],
    ['a bug of our own', new TypeError('x is not a function'), 'ignore'],
    ['an unknown error', new Error('boom'), 'ignore'],
  ])('%s counts as %s', (_name, err, expected) => {
    expect(classifyHostedFailure(err)).toBe(expected);
  });
});

describe('CircuitBreakingLLMProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('complete', () => {
    it('passes a healthy call through untouched', async () => {
      const inner = healthyProvider();
      const { provider } = build(inner);

      await expect(provider.complete([], 10)).resolves.toMatchObject({ content: 'ok' });
      expect(inner.complete).toHaveBeenCalledWith([], 10, undefined, undefined);
    });

    it('opens after the threshold of counted failures and then refuses without calling the model', async () => {
      const inner = failingProvider(providerError('unavailable'));
      const { provider, onShortCircuit } = build(inner);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' });
      expect(inner.complete).toHaveBeenCalledTimes(2);
      expect(onShortCircuit).not.toHaveBeenCalled();

      const refused = await provider.complete([]).catch((e: unknown) => e);

      expect(refused).toBeInstanceOf(LlmProviderError);
      expect(refused).toMatchObject({ kind: 'unavailable' });
      expect(inner.complete).toHaveBeenCalledTimes(2); // no third request
      expect(onShortCircuit).toHaveBeenCalledTimes(1);
    });

    it('refuses in well under 50 ms once open, however slow the model is', async () => {
      const slow: ILLMProvider = {
        complete: vi.fn(
          () => new Promise<never>((_, reject) => setTimeout(() => reject(timeout()), 10_000)),
        ),
        completeWithToolsStream: vi.fn(),
      };
      const { provider } = build(slow, 1);
      const first = provider.complete([]).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      await first;

      const before = Date.now();
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' });
      expect(Date.now() - before).toBeLessThan(50);
      expect(slow.complete).toHaveBeenCalledTimes(1);
    });

    it('rethrows a timeout as an unreachable provider error, and counts it', async () => {
      const { provider } = build(failingProvider(timeout()), 1);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unreachable' });
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' }); // open now
    });

    it('rethrows a failed connection as unreachable', async () => {
      const { provider } = build(failingProvider(fetchFailed()));

      const err = await provider.complete([]).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(LlmProviderError);
      expect(err).toMatchObject({ kind: 'unreachable' });
    });

    it.each(['bad_request', 'auth', 'quota', 'rate_limited'] as const)(
      'never trips on %s: the model answered',
      async (kind) => {
        const inner = failingProvider(providerError(kind));
        const { provider, onShortCircuit } = build(inner, 1);

        for (let i = 0; i < 5; i++) {
          await expect(provider.complete([])).rejects.toMatchObject({ kind });
        }

        expect(inner.complete).toHaveBeenCalledTimes(5);
        expect(onShortCircuit).not.toHaveBeenCalled();
      },
    );

    it('rethrows an unrecognised error unchanged and does not count it', async () => {
      const bug = new Error('boom');
      const inner = failingProvider(bug);
      const { provider } = build(inner, 1);

      await expect(provider.complete([])).rejects.toBe(bug);
      await expect(provider.complete([])).rejects.toBe(bug);
      expect(inner.complete).toHaveBeenCalledTimes(2);
    });

    it('does not count a call the caller cancelled, even if it fails like a timeout', async () => {
      const inner = failingProvider(new DOMException('The operation was aborted.', 'AbortError'));
      const { provider } = build(inner, 1);
      const controller = new AbortController();
      controller.abort();

      const err = await provider
        .complete([], undefined, controller.signal)
        .catch((e: unknown) => e);

      expect((err as DOMException).name).toBe('AbortError'); // unchanged, not turned into unreachable
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unreachable' });
      // The cancelled call did not open the circuit (threshold 1): the next real one still reached the model.
      expect(inner.complete).toHaveBeenCalledTimes(2);
    });

    it('sends one probe after the cooldown, closes on success, and resumes', async () => {
      let healthy = false;
      const inner: ILLMProvider = {
        complete: vi.fn(async () => {
          if (!healthy) throw providerError('unavailable');
          return { content: 'back', usage };
        }),
        completeWithToolsStream: vi.fn(),
      };
      const { provider } = build(inner, 1);
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' }); // refused
      expect(inner.complete).toHaveBeenCalledTimes(1);

      healthy = true;
      vi.advanceTimersByTime(1000);

      await expect(provider.complete([])).resolves.toMatchObject({ content: 'back' });
      await expect(provider.complete([])).resolves.toMatchObject({ content: 'back' });
      expect(inner.complete).toHaveBeenCalledTimes(3);
    });

    it('reopens when the probe fails', async () => {
      const inner = failingProvider(providerError('unavailable'));
      const { provider } = build(inner, 1);
      await expect(provider.complete([])).rejects.toBeDefined();
      vi.advanceTimersByTime(1000);

      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' }); // probe ran
      await expect(provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' }); // refused
      expect(inner.complete).toHaveBeenCalledTimes(2);
    });
  });

  describe('completeWithToolsStream', () => {
    it('passes events through and counts the completed stream as a success', async () => {
      const { provider } = build(healthyProvider(), 1);

      await expect(drain(provider)).resolves.toEqual([delta, done]);
      await expect(drain(provider)).resolves.toEqual([delta, done]);
    });

    it('opens on a stream that fails before any event, then refuses without a request', async () => {
      const inner = failingProvider(providerError('unavailable'));
      const { provider, onShortCircuit } = build(inner, 2);

      await expect(drain(provider)).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(drain(provider)).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(drain(provider)).rejects.toMatchObject({ kind: 'unavailable' });

      expect(inner.completeWithToolsStream).toHaveBeenCalledTimes(2);
      expect(onShortCircuit).toHaveBeenCalledTimes(1);
    });

    it('counts an error after the first event as a failure', async () => {
      const inner: ILLMProvider = {
        complete: vi.fn(),
        completeWithToolsStream: vi.fn(async function* () {
          yield delta;
          throw new TypeError('terminated');
        }),
      };
      const { provider } = build(inner, 1);

      const events: LLMStreamEvent[] = [];
      await expect(
        (async () => {
          for await (const e of provider.completeWithToolsStream([], [])) events.push(e);
        })(),
      ).rejects.toMatchObject({ kind: 'unreachable' });

      expect(events).toEqual([delta]);
      await expect(drain(provider)).rejects.toMatchObject({ kind: 'unavailable' }); // open
      expect(inner.completeWithToolsStream).toHaveBeenCalledTimes(1);
    });

    it('does not count a stream the caller stopped reading, and frees a half-open trial', async () => {
      const inner = healthyProvider();
      const { provider, breaker } = build(inner, 1);
      breaker.acquire().fail(providerError('unavailable'));
      vi.advanceTimersByTime(1000); // half-open: the next call is the trial

      const stream = provider.completeWithToolsStream([], []);
      await stream.next(); // first event, trial now running
      expect(breaker.isOpen()).toBe(true);
      await stream.return(undefined); // consumer walks away

      expect(breaker.isOpen()).toBe(false); // slot given back, not counted either way
      await expect(drain(provider)).resolves.toEqual([delta, done]);
    });

    it('does not count a cancelled call', async () => {
      const inner = failingProvider(new DOMException('aborted', 'AbortError'));
      const { provider } = build(inner, 1);
      const controller = new AbortController();
      controller.abort();

      await expect(drain(provider, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      await expect(drain(provider)).rejects.toMatchObject({ kind: 'unreachable' }); // reached the model
      expect(inner.completeWithToolsStream).toHaveBeenCalledTimes(2);
    });

    it('does not count a bad request', async () => {
      const inner = failingProvider(providerError('bad_request'));
      const { provider } = build(inner, 1);

      await expect(drain(provider)).rejects.toMatchObject({ kind: 'bad_request' });
      await expect(drain(provider)).rejects.toMatchObject({ kind: 'bad_request' });
      expect(inner.completeWithToolsStream).toHaveBeenCalledTimes(2);
    });
  });
});
