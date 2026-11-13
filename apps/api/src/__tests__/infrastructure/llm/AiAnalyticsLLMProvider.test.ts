import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { AiAnalyticsLLMProvider } from '#src/infrastructure/llm/AiAnalyticsLLMProvider.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';
import type { AiGenerationEvent, IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import type {
  ILLMProvider,
  LLMMessage,
  LLMStreamEvent,
} from '#src/use-cases/ports/ILLMProvider.js';

const SECRET_PROMPT = 'my salary expectations are 180k';
const SECRET_REPLY = 'here is your confidential cover letter';
const MESSAGES: LLMMessage[] = [{ role: 'user', content: SECRET_PROMPT }];

const contextManager = new AsyncLocalStorageContextManager();
const tracerProvider = new TracerProvider();
beforeAll(() => {
  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(contextManager.enable());
});
afterAll(async () => {
  await tracerProvider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

function fakeAnalytics() {
  const generation = vi.fn<(e: AiGenerationEvent) => void>();
  const analytics: IAiAnalytics = {
    generation,
    span: vi.fn(),
    feedback: vi.fn(),
    feedbackCleared: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  return { analytics, generation };
}

function clock(step = 10): () => number {
  let t = 0;
  return () => {
    t += step;
    return t;
  };
}

function build(inner: ILLMProvider, over: { provider?: string; model?: string | null } = {}) {
  const { analytics, generation } = fakeAnalytics();
  const provider = new AiAnalyticsLLMProvider({
    inner,
    analytics,
    userId: 'user-1',
    provider: over.provider ?? 'anthropic',
    model: over.model === undefined ? 'claude-haiku-4-5' : over.model,
    feature: AI_FEATURE.CHAT,
    source: 'byok',
    promptVersion: 3,
    now: clock(),
  });
  return { provider, generation };
}

const usage = {
  promptTokens: 1000,
  completionTokens: 200,
  cacheReadTokens: 100,
  cacheWriteTokens: 50,
  reasoningTokens: 20,
};

const completing = (failWith?: unknown): ILLMProvider => ({
  complete: vi.fn(async () => {
    if (failWith) throw failWith;
    return { content: SECRET_REPLY, usage };
  }),
  completeWithToolsStream: vi.fn(),
});

const streaming = (events: LLMStreamEvent[], failAfter?: unknown): ILLMProvider => ({
  complete: vi.fn(),
  completeWithToolsStream: vi.fn(async function* () {
    for (const e of events) yield e;
    if (failAfter) throw failAfter;
  }),
});

/** No prompt, reply, message or tool key, and none of the secrets, in any payload. */
const FORBIDDEN_KEY =
  /prompt(?!Version)|completion|message|content|input(?!Tokens)|output(?!Tokens)|text|tool/i;
function expectNoContent(event: AiGenerationEvent) {
  const json = JSON.stringify(event);
  expect(json).not.toContain(SECRET_PROMPT);
  expect(json).not.toContain(SECRET_REPLY);
  for (const key of Object.keys(event)) expect(key).not.toMatch(FORBIDDEN_KEY);
}

describe('AiAnalyticsLLMProvider', () => {
  it('sends one generation for a completed call, with cost, tokens and a fallback trace id', async () => {
    const { provider, generation } = build(completing());

    const result = await provider.complete(MESSAGES);

    expect(generation).toHaveBeenCalledOnce();
    const event = generation.mock.calls[0]![0];
    expect(event).toMatchObject({
      userId: 'user-1',
      feature: 'chat',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      source: 'byok',
      promptVersion: '3',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
      reasoningTokens: 20,
      outcome: 'ok',
      errorKind: null,
      latencyMs: 10,
    });
    expect(event.costMicros).toBeGreaterThan(0);
    expect(event.traceId).toBeTruthy();
    expect(event.spanId).toBeUndefined();
    expect(event.timeToFirstTokenMs).toBeUndefined();
    expect(result.answeredBy?.traceId).toBe(event.traceId);
    expectNoContent(event);
  });

  it('uses the active span as the trace and span id', async () => {
    const { provider, generation } = build(completing());
    const span = trace.getTracer('t').startSpan('llm.complete');

    await context.with(trace.setSpan(context.active(), span), () => provider.complete(MESSAGES));

    const event = generation.mock.calls[0]![0];
    expect(event.traceId).toBe(span.spanContext().traceId);
    expect(event.spanId).toBe(span.spanContext().spanId);
    span.end();
  });

  it('sends a stream at done, with time to first token and the trace id on done', async () => {
    const { provider, generation } = build(
      streaming([
        { type: 'text_delta', text: SECRET_REPLY },
        { type: 'done', content: SECRET_REPLY, toolCalls: [], usage },
      ]),
    );

    const events: LLMStreamEvent[] = [];
    for await (const e of provider.completeWithToolsStream(MESSAGES, [])) events.push(e);

    expect(generation).toHaveBeenCalledOnce();
    const event = generation.mock.calls[0]![0];
    expect(event.outcome).toBe('ok');
    expect(event.timeToFirstTokenMs).toBeGreaterThan(0);
    expect(event.inputTokens).toBe(1000);
    const done = events[events.length - 1];
    expect(done?.type === 'done' && done.answeredBy?.traceId).toBe(event.traceId);
    expectNoContent(event);
  });

  it('records a consumer that stops early as aborted, charged for the prompt it was billed', async () => {
    const { provider, generation } = build(
      streaming([
        { type: 'prompt_usage', promptTokens: 400 },
        { type: 'text_delta', text: SECRET_REPLY },
        { type: 'done', content: SECRET_REPLY, toolCalls: [], usage },
      ]),
    );

    for await (const e of provider.completeWithToolsStream(MESSAGES, [])) {
      if (e.type === 'text_delta') break;
    }

    expect(generation).toHaveBeenCalledOnce();
    expect(generation.mock.calls[0]![0]).toMatchObject({
      outcome: 'aborted',
      errorKind: null,
      inputTokens: 400,
      outputTokens: 0,
    });
  });

  it('records a provider error with its kind and no message', async () => {
    const { provider, generation } = build(
      completing(new LlmProviderError('rate_limited', { status: 429, detail: SECRET_PROMPT })),
    );

    await expect(provider.complete(MESSAGES)).rejects.toBeInstanceOf(LlmProviderError);

    const event = generation.mock.calls[0]![0];
    expect(event).toMatchObject({ outcome: 'error', errorKind: 'rate_limited', inputTokens: 0 });
    expect(event.costMicros).toBeNull();
    expectNoContent(event);
  });

  it('records a stream that fails after output as an error', async () => {
    const { provider, generation } = build(
      streaming(
        [{ type: 'text_delta', text: 'x' }],
        new LlmProviderError('unavailable', { status: 503 }),
      ),
    );

    await expect(async () => {
      for await (const e of provider.completeWithToolsStream(MESSAGES, [])) void e;
    }).rejects.toBeInstanceOf(LlmProviderError);

    expect(generation.mock.calls[0]![0]).toMatchObject({
      outcome: 'error',
      errorKind: 'unavailable',
    });
  });

  it('treats a caller abort as aborted, not an error', async () => {
    const controller = new AbortController();
    controller.abort();
    const { provider, generation } = build(completing(new Error('boom')));

    await expect(provider.complete(MESSAGES, undefined, controller.signal)).rejects.toThrow();

    expect(generation.mock.calls[0]![0].outcome).toBe('aborted');
  });

  it('leaves the cost out for a model with no price', async () => {
    const { provider, generation } = build(completing(), {
      provider: 'openai',
      model: 'not-a-priced-model',
    });

    await provider.complete(MESSAGES);

    expect(generation.mock.calls[0]![0].costMicros).toBeNull();
  });

  it('never lets an analytics failure fail the call', async () => {
    const { analytics } = fakeAnalytics();
    analytics.generation = () => {
      throw new Error('posthog down');
    };
    const provider = new AiAnalyticsLLMProvider({
      inner: completing(),
      analytics,
      userId: 'u',
      provider: 'anthropic',
      model: null,
      feature: AI_FEATURE.CHAT,
      source: 'byok',
    });

    await expect(provider.complete(MESSAGES)).resolves.toMatchObject({ content: SECRET_REPLY });
  });
});
