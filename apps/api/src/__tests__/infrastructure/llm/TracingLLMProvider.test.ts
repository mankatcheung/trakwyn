import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { LLM_SPAN, TracingLLMProvider } from '#src/infrastructure/llm/TracingLLMProvider.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { TRACING } from '#src/infrastructure/config/constants.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import type {
  ILLMProvider,
  LLMMessage,
  LLMStreamEvent,
} from '#src/use-cases/ports/ILLMProvider.js';

/**
 * Asserts on spans a real SDK produced, as `tracedUseCase.test.ts` does: the
 * decorator's job is the shape of what it emits, and a mocked tracer would
 * let that drift unnoticed.
 */
const exporter = new InMemorySpanExporter();
const tracerProvider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter })],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(contextManager.enable());
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await tracerProvider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

const SECRET_PROMPT = 'my salary expectations are 180k';
const SECRET_REPLY = 'here is your confidential cover letter';
const MESSAGES: LLMMessage[] = [{ role: 'user', content: SECRET_PROMPT }];

const onlySpan = (): ReadableSpan => {
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  return spans[0]!;
};

/** A clock that advances by `step` ms on every read, so durations are exact. */
function tickingClock(step = 10): () => number {
  let t = 0;
  return () => {
    t += step;
    return t;
  };
}

function makeInner(overrides: Partial<ILLMProvider> = {}): ILLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: SECRET_REPLY, usage: null }),
    completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
      yield { type: 'done', content: SECRET_REPLY, toolCalls: [], usage: null };
    }),
    ...overrides,
  };
}

function build(inner: ILLMProvider, now = tickingClock()) {
  const metrics = makeFakeMetrics();
  const provider = new TracingLLMProvider({
    inner,
    metrics,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    now,
  });
  return { provider, metrics };
}

async function drain(stream: AsyncGenerator<LLMStreamEvent>): Promise<LLMStreamEvent[]> {
  const events: LLMStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

/** Nothing the user or the model wrote may appear anywhere on the span. */
function expectNoContent(span: ReadableSpan): void {
  const serialized = JSON.stringify({
    name: span.name,
    attributes: span.attributes,
    events: span.events,
    status: span.status,
  });
  expect(serialized).not.toContain(SECRET_PROMPT);
  expect(serialized).not.toContain(SECRET_REPLY);
}

describe('TracingLLMProvider', () => {
  describe('complete', () => {
    it('emits one client span with provider, model and token counts', async () => {
      const inner = makeInner({
        complete: vi.fn().mockResolvedValue({
          content: SECRET_REPLY,
          usage: {
            promptTokens: 120,
            completionTokens: 30,
            cacheReadTokens: 100,
            cacheWriteTokens: 0,
          },
        }),
      });
      const { provider } = build(inner);

      const result = await provider.complete(MESSAGES, 256);

      expect(result.content).toBe(SECRET_REPLY);
      const span = onlySpan();
      expect(span.name).toBe(LLM_SPAN.COMPLETE);
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes).toEqual({
        [LLM_SPAN.OPERATION_NAME]: 'chat',
        [LLM_SPAN.PROVIDER]: 'anthropic',
        [LLM_SPAN.MODEL]: 'claude-sonnet-5',
        [LLM_SPAN.INPUT_TOKENS]: 120,
        [LLM_SPAN.OUTPUT_TOKENS]: 30,
        [LLM_SPAN.CACHE_READ_TOKENS]: 100,
        [LLM_SPAN.CACHE_WRITE_TOKENS]: 0,
        [LLM_SPAN.ESTIMATED]: false,
        [LLM_SPAN.OUTCOME]: 'success',
      });
      expectNoContent(span);
    });

    it('records the call, its latency and its tokens as metrics', async () => {
      const inner = makeInner({
        complete: vi.fn().mockResolvedValue({
          content: SECRET_REPLY,
          usage: { promptTokens: 120, completionTokens: 30 },
        }),
      });
      const { provider, metrics } = build(inner);

      await provider.complete(MESSAGES);

      expect(metrics.llmCalls).toEqual([
        {
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          operation: 'complete',
          outcome: 'success',
          errorKind: null,
          durationMs: 10,
        },
      ]);
      expect(metrics.llmTokens).toEqual([
        { provider: 'anthropic', direction: 'input', count: 120 },
        { provider: 'anthropic', direction: 'output', count: 30 },
      ]);
    });

    it('records no token counts when the provider reported no usage', async () => {
      const { provider, metrics } = build(makeInner());

      await provider.complete(MESSAGES);

      expect(onlySpan().attributes[LLM_SPAN.INPUT_TOKENS]).toBeUndefined();
      expect(metrics.llmTokens).toEqual([]);
      expect(metrics.llmCalls).toHaveLength(1);
    });

    it('omits the model attribute when the key has no model set', async () => {
      const provider = new TracingLLMProvider({
        inner: makeInner(),
        metrics: makeFakeMetrics(),
        provider: 'openai',
        model: null,
      });

      await provider.complete(MESSAGES);

      expect(onlySpan().attributes[LLM_SPAN.MODEL]).toBeUndefined();
    });

    it('marks the span ERROR with the provider error kind, and rethrows it unchanged', async () => {
      const refusal = new LlmProviderError('rate_limited', {
        provider: 'Anthropic',
        status: 429,
        detail: SECRET_PROMPT,
      });
      const { provider, metrics } = build(
        makeInner({ complete: vi.fn().mockRejectedValue(refusal) }),
      );

      await expect(provider.complete(MESSAGES)).rejects.toBe(refusal);

      const span = onlySpan();
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes).toMatchObject({
        [LLM_SPAN.OUTCOME]: 'error',
        [LLM_SPAN.ERROR_KIND]: 'rate_limited',
        [LLM_SPAN.ERROR_TYPE]: 'LlmProviderError',
        [LLM_SPAN.HTTP_STATUS]: 429,
        [TRACING.ERROR_CODE_ATTRIBUTE]: ERROR_CODES.AI_PROVIDER_ERROR,
      });
      // `detail` holds the provider's body; only the user-facing message is kept.
      expectNoContent(span);
      expect(metrics.llmCalls[0]).toMatchObject({ outcome: 'error', errorKind: 'rate_limited' });
    });

    it('keeps only the class name of an error that is not a provider refusal', async () => {
      const parseError = new SyntaxError(`Unexpected token in "${SECRET_REPLY}"`);
      const { provider, metrics } = build(
        makeInner({ complete: vi.fn().mockRejectedValue(parseError) }),
      );

      await expect(provider.complete(MESSAGES)).rejects.toBe(parseError);

      const span = onlySpan();
      expect(span.status).toEqual({ code: SpanStatusCode.ERROR });
      expect(span.attributes[LLM_SPAN.ERROR_TYPE]).toBe('SyntaxError');
      expect(span.attributes[LLM_SPAN.ERROR_KIND]).toBeUndefined();
      expect(span.events).toEqual([]);
      expectNoContent(span);
      expect(metrics.llmCalls[0]).toMatchObject({ outcome: 'error', errorKind: null });
    });

    it('counts a call the caller aborted as aborted, not as a provider error', async () => {
      const controller = new AbortController();
      controller.abort();
      const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
      const { provider, metrics } = build(
        makeInner({ complete: vi.fn().mockRejectedValue(abort) }),
      );

      await expect(provider.complete(MESSAGES, undefined, controller.signal)).rejects.toBe(abort);

      expect(onlySpan().status.code).toBe(SpanStatusCode.UNSET);
      expect(onlySpan().attributes[LLM_SPAN.OUTCOME]).toBe('aborted');
      expect(metrics.llmCalls[0]).toMatchObject({ outcome: 'aborted', errorKind: null });
    });
  });

  describe('completeWithToolsStream', () => {
    it('reports tokens and time to first token for a completed stream', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'prompt_usage', promptTokens: 200 };
          yield { type: 'text_delta', text: SECRET_REPLY };
          yield {
            type: 'done',
            content: SECRET_REPLY,
            toolCalls: [],
            usage: { promptTokens: 200, completionTokens: 40, cacheWriteTokens: 150 },
          };
        }),
      });
      const { provider, metrics } = build(inner);

      const events = await drain(provider.completeWithToolsStream(MESSAGES, []));

      expect(events.map((event) => event.type)).toEqual(['prompt_usage', 'text_delta', 'done']);
      const span = onlySpan();
      expect(span.name).toBe(LLM_SPAN.STREAM);
      expect(span.attributes).toMatchObject({
        [LLM_SPAN.INPUT_TOKENS]: 200,
        [LLM_SPAN.OUTPUT_TOKENS]: 40,
        [LLM_SPAN.CACHE_WRITE_TOKENS]: 150,
        [LLM_SPAN.ESTIMATED]: false,
        [LLM_SPAN.OUTCOME]: 'success',
        // Clock reads: start 10, first text 20, done 30.
        [LLM_SPAN.TIME_TO_FIRST_TOKEN_MS]: 10,
      });
      expectNoContent(span);
      // Latency stops at `done`, not when the consumer lets go of the stream.
      expect(metrics.llmCalls).toEqual([
        expect.objectContaining({ operation: 'stream', outcome: 'success', durationMs: 20 }),
      ]);
      expect(metrics.llmTokens).toEqual([
        { provider: 'anthropic', direction: 'input', count: 200 },
        { provider: 'anthropic', direction: 'output', count: 40 },
        { provider: 'anthropic', direction: 'cache_write', count: 150 },
      ]);
    });

    it('counts a `done`-only stream (Gemini) as its first token', async () => {
      const { provider } = build(makeInner());

      await drain(provider.completeWithToolsStream(MESSAGES, []));

      expect(onlySpan().attributes[LLM_SPAN.TIME_TO_FIRST_TOKEN_MS]).toBe(10);
    });

    it('marks a stream the consumer abandoned as aborted and closes the provider stream', async () => {
      const closed = vi.fn();
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          try {
            yield { type: 'prompt_usage', promptTokens: 200 };
            yield { type: 'text_delta', text: SECRET_REPLY };
            yield { type: 'text_delta', text: 'never read' };
          } finally {
            closed();
          }
        }),
      });
      const { provider, metrics } = build(inner);

      for await (const event of provider.completeWithToolsStream(MESSAGES, [])) {
        if (event.type === 'text_delta') break;
      }

      expect(closed).toHaveBeenCalledOnce();
      const span = onlySpan();
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes).toMatchObject({
        [LLM_SPAN.OUTCOME]: 'aborted',
        [LLM_SPAN.INPUT_TOKENS]: 200,
        [LLM_SPAN.OUTPUT_TOKENS]: 0,
        [LLM_SPAN.ESTIMATED]: false,
      });
      expect(metrics.llmCalls[0]).toMatchObject({ operation: 'stream', outcome: 'aborted' });
    });

    it('estimates the prompt of an aborted stream whose provider never reported it', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          yield { type: 'text_delta', text: SECRET_REPLY };
          yield { type: 'text_delta', text: 'never read' };
        }),
      });
      const { provider, metrics } = build(inner);

      for await (const event of provider.completeWithToolsStream(MESSAGES, [])) {
        void event;
        break;
      }

      const span = onlySpan();
      expect(span.attributes[LLM_SPAN.ESTIMATED]).toBe(true);
      expect(span.attributes[LLM_SPAN.INPUT_TOKENS]).toBeGreaterThan(0);
      expect(metrics.llmTokens[0]).toMatchObject({ direction: 'input' });
    });

    it('marks a stream the provider refused ERROR with its kind', async () => {
      const refusal = new LlmProviderError('auth', { provider: 'Anthropic', status: 401 });
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          throw refusal;
        }),
      });
      const { provider, metrics } = build(inner);

      await expect(drain(provider.completeWithToolsStream(MESSAGES, []))).rejects.toBe(refusal);

      const span = onlySpan();
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes).toMatchObject({
        [LLM_SPAN.OUTCOME]: 'error',
        [LLM_SPAN.ERROR_KIND]: 'auth',
        [LLM_SPAN.HTTP_STATUS]: 401,
      });
      // Refused before any output: nothing was billed, so no tokens.
      expect(span.attributes[LLM_SPAN.INPUT_TOKENS]).toBeUndefined();
      expect(span.attributes[LLM_SPAN.TIME_TO_FIRST_TOKEN_MS]).toBeUndefined();
      expect(metrics.llmCalls[0]).toMatchObject({ outcome: 'error', errorKind: 'auth' });
      expect(metrics.llmTokens).toEqual([]);
    });

    it('keeps the span active across iteration, so provider-side spans nest under it', async () => {
      const inner = makeInner({
        completeWithToolsStream: vi.fn(async function* (): AsyncGenerator<LLMStreamEvent> {
          trace.getTracer('test').startSpan('http.request').end();
          yield { type: 'text_delta', text: 'a' };
          trace.getTracer('test').startSpan('http.request.more').end();
          yield { type: 'done', content: 'a', toolCalls: [], usage: null };
        }),
      });
      const { provider } = build(inner);

      await drain(provider.completeWithToolsStream(MESSAGES, []));

      const spans = exporter.getFinishedSpans();
      const llm = spans.find((span) => span.name === LLM_SPAN.STREAM)!;
      const children = spans.filter((span) => span.name.startsWith('http.request'));
      expect(children).toHaveLength(2);
      for (const child of children) {
        expect(child.parentSpanContext?.spanId).toBe(llm.spanContext().spanId);
      }
    });
  });
});
