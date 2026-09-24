import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { ToolCallObserver } from '#src/infrastructure/observability/ToolCallObserver.js';
import { SECURITY_EVENTS, TRACING } from '#src/infrastructure/config/constants.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

/** Real SDK spans, as in `tracedUseCase.test.ts`: the span's shape is the point. */
const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

const TOOLS = [
  { name: 'get_application', access: 'read' },
  { name: 'create_note', access: 'write' },
] as const;

function makeObserver(tracing = true) {
  const logger = makeLogger();
  const metrics = makeFakeMetrics();
  const observer = new ToolCallObserver({ tools: TOOLS, logger, metrics, tracing });
  return { observer, logger, metrics };
}

const onlySpan = () => {
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  return spans[0]!;
};

describe('ToolCallObserver', () => {
  it('opens a span named after the surface and tool, with its access tag and token scope', async () => {
    const { observer } = makeObserver();

    await observer.observe(
      { surface: 'mcp', name: 'get_application', tokenScope: 'read' },
      async (call) => {
        call.succeeded('{"id":"app-1"}');
        return 'reply';
      },
    );

    const span = onlySpan();
    expect(span.name).toBe('mcp.tool get_application');
    expect(span.attributes).toEqual({
      [TRACING.TOOL_NAME_ATTRIBUTE]: 'get_application',
      [TRACING.TOOL_ACCESS_ATTRIBUTE]: 'read',
      [TRACING.TOOL_SURFACE_ATTRIBUTE]: 'mcp',
      [TRACING.MCP_TOKEN_SCOPE_ATTRIBUTE]: 'read',
      [TRACING.TOOL_OUTCOME_ATTRIBUTE]: 'ok',
      [TRACING.TOOL_RESULT_BYTES_ATTRIBUTE]: 14,
    });
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('measures a non-string result by its JSON size, in UTF-8 bytes', async () => {
    const { observer } = makeObserver();

    await observer.observe({ surface: 'chat', name: 'get_application' }, async (call) => {
      call.succeeded({ company: 'Café' });
      return null;
    });

    // {"company":"Café"} is 18 characters, and é is two bytes.
    expect(onlySpan().attributes[TRACING.TOOL_RESULT_BYTES_ATTRIBUTE]).toBe(19);
  });

  it('records no argument or result content anywhere on the span', async () => {
    const { observer } = makeObserver();
    const secret = 'app-secret-id';

    await observer.observe({ surface: 'chat', name: 'get_application' }, async (call) => {
      call.succeeded({ id: secret, notes: 'private' });
      return null;
    });

    expect(JSON.stringify(onlySpan().attributes)).not.toContain(secret);
    expect(JSON.stringify(onlySpan().attributes)).not.toContain('private');
    expect(onlySpan().attributes).not.toHaveProperty(TRACING.MCP_TOKEN_SCOPE_ATTRIBUTE);
  });

  it('nests the work the tool does under its span', async () => {
    const { observer } = makeObserver();
    const tracer = trace.getTracer('test');

    await observer.observe({ surface: 'chat', name: 'get_application' }, async () => {
      tracer.startSpan('pg.query').end();
    });

    const spans = exporter.getFinishedSpans();
    const tool = spans.find((span) => span.name === 'chat.tool get_application')!;
    const query = spans.find((span) => span.name === 'pg.query')!;
    expect(query.parentSpanContext?.spanId).toBe(tool.spanContext().spanId);
  });

  it('marks an internal failure ERROR with the exception, and counts it', async () => {
    const { observer, metrics } = makeObserver();

    await observer.observe({ surface: 'chat', name: 'get_application' }, async (call) => {
      call.failed(new Error('connection reset'));
      return { error: 'Tool call failed' };
    });

    const span = onlySpan();
    expect(span.attributes[TRACING.TOOL_OUTCOME_ATTRIBUTE]).toBe('internal_error');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((event) => event.name)).toContain('exception');
    expect(metrics.toolCalls).toEqual([
      { surface: 'chat', tool: 'get_application', outcome: 'internal_error' },
    ]);
  });

  it('records a domain error by code without marking the span failed', async () => {
    const { observer } = makeObserver();

    await observer.observe({ surface: 'chat', name: 'get_application' }, async (call) => {
      call.failed(new NotFoundError('Application'));
    });

    const span = onlySpan();
    expect(span.attributes[TRACING.TOOL_OUTCOME_ATTRIBUTE]).toBe('domain_error');
    expect(span.attributes[TRACING.ERROR_CODE_ATTRIBUTE]).toBe(ERROR_CODES.NOT_FOUND);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('classifies a ValidationError as invalid params', async () => {
    const { observer } = makeObserver();

    await observer.observe({ surface: 'chat', name: 'get_application' }, async (call) => {
      call.failed(new ValidationError('Unknown tool'));
    });

    expect(onlySpan().attributes[TRACING.TOOL_OUTCOME_ATTRIBUTE]).toBe('invalid_params');
  });

  it('classifies and rethrows an error the observed function lets escape', async () => {
    const { observer, metrics } = makeObserver();
    const boom = new Error('boom');

    await expect(
      observer.observe({ surface: 'mcp', name: 'get_application' }, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(onlySpan().status.code).toBe(SpanStatusCode.ERROR);
    expect(metrics.toolCalls[0]?.outcome).toBe('internal_error');
  });

  it('logs and counts a refusal with the user, tool and scope', async () => {
    const { observer, logger, metrics } = makeObserver();

    await observer.observe(
      { surface: 'mcp', name: 'create_note', tokenScope: 'read' },
      async (call) => call.refused('user-1'),
    );

    expect(logger.warn).toHaveBeenCalledWith('MCP tool refused for token scope', undefined, {
      event: SECURITY_EVENTS.MCP_TOOL_REFUSED,
      userId: 'user-1',
      tool: 'create_note',
      scope: 'read',
    });
    expect(metrics.mcpToolRefused).toEqual([{ tool: 'create_note', scope: 'read' }]);
    expect(metrics.toolCalls).toEqual([
      { surface: 'mcp', tool: 'create_note', outcome: 'refused' },
    ]);
    const span = onlySpan();
    expect(span.attributes[TRACING.TOOL_ACCESS_ATTRIBUTE]).toBe('write');
    expect(span.attributes[TRACING.TOOL_OUTCOME_ATTRIBUTE]).toBe('refused');
  });

  it('records a tool name outside the catalogue as unknown, so a client cannot mint names', async () => {
    const { observer, metrics } = makeObserver();

    await observer.observe({ surface: 'mcp', name: 'drop_table_users' }, async (call) =>
      call.invalidParams(),
    );

    const span = onlySpan();
    expect(span.name).toBe('mcp.tool unknown');
    expect(span.attributes[TRACING.TOOL_NAME_ATTRIBUTE]).toBe('unknown');
    expect(span.attributes[TRACING.TOOL_ACCESS_ATTRIBUTE]).toBe('unknown');
    expect(metrics.toolCalls).toEqual([
      { surface: 'mcp', tool: 'unknown', outcome: 'invalid_params' },
    ]);
  });

  describe('with tracing off (dev and test)', () => {
    it('opens no span and never serialises the result, but still counts and logs', async () => {
      const { observer, logger, metrics } = makeObserver(false);
      const unserialisable = { toJSON: () => expect.fail('result was serialised') };

      const value = await observer.observe(
        { surface: 'chat', name: 'get_application' },
        async (call) => {
          call.succeeded(unserialisable);
          return 'reply';
        },
      );
      await observer.observe(
        { surface: 'mcp', name: 'create_note', tokenScope: 'read' },
        async (call) => call.refused('user-1'),
      );

      expect(value).toBe('reply');
      expect(exporter.getFinishedSpans()).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(metrics.toolCalls.map((call) => call.outcome)).toEqual(['ok', 'refused']);
    });
  });
});
