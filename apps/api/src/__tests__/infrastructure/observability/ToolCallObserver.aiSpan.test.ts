import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { ToolCallObserver } from '#src/infrastructure/observability/ToolCallObserver.js';
import { PostHogAiAnalytics } from '#src/infrastructure/analytics/PostHogAiAnalytics.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { AiAnalyticsLLMProvider } from '#src/infrastructure/llm/AiAnalyticsLLMProvider.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type {
  AiGenerationEvent,
  AiSpanEvent,
  IAiAnalytics,
} from '#src/use-cases/ports/IAiAnalytics.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

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

const TOOLS = [
  { name: 'get_application', access: 'read' },
  { name: 'create_note', access: 'write' },
] as const;

const SECRET_ARGS = 'applicationId=secret-app-42';
const SECRET_RESULT = 'Dear hiring manager, my salary is 180k';

function setup(tracing = true) {
  const spans: AiSpanEvent[] = [];
  const generations: AiGenerationEvent[] = [];
  const analytics: IAiAnalytics = {
    generation: (e) => void generations.push(e),
    span: (e) => void spans.push(e),
    feedback: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  const observer = new ToolCallObserver({
    tools: TOOLS,
    logger: makeLogger(),
    metrics: makeFakeMetrics(),
    tracing,
    aiAnalytics: analytics,
  });
  return { observer, analytics, spans, generations };
}

const streamingProvider = (): ILLMProvider => ({
  complete: vi.fn(),
  completeWithToolsStream: vi.fn(async function* () {
    yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1 } } as never;
  }),
});

describe('ToolCallObserver PostHog spans (JEF-568)', () => {
  it('a chat turn with two tool calls is one trace with 2 spans beside its generations, in one session', async () => {
    const { observer, analytics, spans, generations } = setup();
    const llm = new AiAnalyticsLLMProvider({
      inner: streamingProvider(),
      analytics,
      userId: 'user-1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      feature: AI_FEATURE.CHAT,
      source: 'byok',
      sessionKey: 'conv-1',
    });
    const drain = async () => {
      for await (const event of llm.completeWithToolsStream([], [])) void event;
    };

    // One request: the HTTP span is the active context for the whole turn.
    const request = trace.getTracer('test').startSpan('request');
    await context.with(trace.setSpan(context.active(), request), async () => {
      await drain();
      await observer.observe(
        { surface: 'chat', name: 'get_application', userId: 'user-1' },
        async (c) => {
          c.succeeded('{}');
        },
      );
      await drain();
      await observer.observe(
        { surface: 'chat', name: 'create_note', userId: 'user-1' },
        async (c) => {
          c.proposed({ status: 'proposed' });
        },
      );
      await drain();
    });
    request.end();

    const traceId = request.spanContext().traceId;
    expect(generations).toHaveLength(3);
    expect(spans).toHaveLength(2);
    expect(new Set([...generations, ...spans].map((e) => e.traceId))).toEqual(new Set([traceId]));
    expect(new Set(generations.map((g) => g.sessionKey))).toEqual(new Set(['conv-1']));
    expect(spans.map((s) => s.name)).toEqual(['get_application', 'create_note']);
    for (const span of spans) {
      expect(span.parentId).toBe(request.spanContext().spanId);
      expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(span.surface).toBe('chat');
    }
    expect(spans[0]).toMatchObject({ access: 'read', toolOutcome: 'ok', outcome: 'ok' });
    expect(spans[1]).toMatchObject({ access: 'write', toolOutcome: 'proposed' });
  });

  it('an MCP call sends a span and no generation, with the result size', async () => {
    const { observer, spans, generations } = setup();

    await observer.observe(
      { surface: 'mcp', name: 'get_application', userId: 'user-1', tokenScope: 'read' },
      async (c) => c.succeeded('{"id":"app-1"}'),
    );

    expect(generations).toHaveLength(0);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      userId: 'user-1',
      name: 'get_application',
      surface: 'mcp',
      resultBytes: 14,
    });
    expect(spans[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [
      'domain_error',
      async () => {
        throw new NotFoundError('nope');
      },
      'ok',
    ],
    [
      'internal_error',
      async () => {
        throw new Error('boom');
      },
      'error',
    ],
    ['invalid_params', async (c: { invalidParams(): void }) => c.invalidParams(), 'ok'],
    ['refused', async (c: { refused(u: string): void }) => c.refused('user-1'), 'ok'],
    ['rate_limited', async (c: { rateLimited(): void }) => c.rateLimited(), 'ok'],
  ] as const)('maps the %s outcome', async (toolOutcome, run, outcome) => {
    const { observer, spans } = setup();

    await observer
      .observe({ surface: 'mcp', name: 'create_note', userId: 'user-1' }, run as never)
      .catch(() => undefined);

    expect(spans[0]).toMatchObject({ toolOutcome, outcome });
  });

  it('records a name outside the catalogue as unknown', async () => {
    const { observer, spans } = setup();

    await observer.observe({ surface: 'mcp', name: 'drop_database', userId: 'user-1' }, async (c) =>
      c.invalidParams(),
    );

    expect(spans[0]).toMatchObject({ name: 'unknown', access: 'unknown' });
    expect(JSON.stringify(spans[0])).not.toContain('drop_database');
  });

  it('still sends a span, as its own trace, when tracing is off', async () => {
    const { observer, spans } = setup(false);

    await observer.observe(
      { surface: 'chat', name: 'get_application', userId: 'user-1' },
      async (c) => c.succeeded('{}'),
    );

    expect(spans[0]!.traceId).toMatch(/\S/);
    expect(spans[0]).not.toHaveProperty('spanId');
    expect(spans[0]!.resultBytes).toBe(2);
  });

  it('never fails the call when analytics throws', async () => {
    const { observer, analytics } = setup();
    analytics.span = () => {
      throw new Error('posthog down');
    };

    await expect(
      observer.observe(
        { surface: 'chat', name: 'get_application', userId: 'user-1' },
        async () => 'ok',
      ),
    ).resolves.toBe('ok');
  });

  it('puts no tool arguments or results in the PostHog payload', async () => {
    const capture = vi.fn();
    const posthog = new PostHogAiAnalytics({
      apiKey: 'k',
      host: 'h',
      release: 'r',
      logger: makeLogger(),
      client: { capture, shutdown: vi.fn().mockResolvedValue(undefined) },
    });
    const observer = new ToolCallObserver({
      tools: TOOLS,
      logger: makeLogger(),
      metrics: makeFakeMetrics(),
      tracing: true,
      aiAnalytics: posthog,
    });

    await observer.observe(
      { surface: 'chat', name: 'get_application', userId: 'user-1' },
      async (c) => {
        // The arguments are in scope of the caller; the observer is only handed the result.
        void SECRET_ARGS;
        c.succeeded({ coverLetter: SECRET_RESULT });
      },
    );

    expect(capture).toHaveBeenCalledOnce();
    const json = JSON.stringify(capture.mock.calls[0]![0]);
    expect(json).not.toContain(SECRET_RESULT);
    expect(json).not.toContain(SECRET_ARGS);
    expect(json).not.toContain('user-1');
    const { properties } = capture.mock.calls[0]![0];
    const ALLOWED = new Set([
      '$ai_is_error',
      '$ai_latency',
      '$ai_parent_id',
      '$ai_span_id',
      '$ai_span_name',
      '$ai_trace_id',
      '$process_person_profile',
      'access',
      'outcome',
      'release',
      'result_bytes',
      'surface',
    ]);
    for (const key of Object.keys(properties)) expect(ALLOWED).toContain(key);
    expect(properties.$ai_span_name).toBe('get_application');
  });
});
