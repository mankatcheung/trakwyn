import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';
import { INBOUND_TRACEPARENT_EVENT } from '#src/infrastructure/observability/inboundTraceparent.js';

const { flushObservabilityMock, recordGraphQLOperationMock } = vi.hoisted(() => ({
  flushObservabilityMock: vi.fn().mockResolvedValue(undefined),
  recordGraphQLOperationMock: vi.fn(),
}));

vi.mock('#src/infrastructure/observability/tracing.js', () => ({
  fastifyOtelInstrumentation: { plugin: () => vi.fn() },
  isObservabilityEnabled: true,
  flushObservability: flushObservabilityMock,
}));

vi.mock('#src/infrastructure/observability/graphqlOperationSpanName.js', () => ({
  recordGraphQLOperation: recordGraphQLOperationMock,
}));

const previousEnv: Record<string, string | undefined> = {};
let closeDb: (() => Promise<void>) | undefined;
let buildApp: (fastify: FastifyInstance) => Promise<FastifyInstance>;

beforeAll(async () => {
  for (const key of [ENV.AXIOM_TOKEN, ENV.AXIOM_DATASET, ENV.LOG_INBOUND_TRACEPARENT]) {
    previousEnv[key] = process.env[key];
  }

  process.env[ENV.DATABASE_URL] = 'pglite:memory';
  const client = await import('#src/infrastructure/db/client.js');
  closeDb = client.closeDb;
  await applyMigrations(client.db);

  process.env[ENV.JWT_SECRET] = 'test-secret';
  process.env[ENV.JWT_REFRESH_SECRET] = 'test-refresh-secret';

  ({ buildApp } = await import('#src/http/buildApp.js'));
});

afterAll(async () => {
  for (const key of [ENV.AXIOM_TOKEN, ENV.AXIOM_DATASET, ENV.LOG_INBOUND_TRACEPARENT]) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  await closeDb?.();
});

describe('buildApp observability flush hook', () => {
  let app: FastifyInstance | undefined;

  beforeAll(async () => {
    app = await buildApp(Fastify({ logger: false }));
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    flushObservabilityMock.mockClear();
    recordGraphQLOperationMock.mockClear();
  });

  it('awaits a flush after every response when observability is enabled', async () => {
    const res = await app!.inject({ method: 'GET', url: ROUTES.HEALTH });

    expect(res.statusCode).toBe(200);
    expect(flushObservabilityMock).toHaveBeenCalledTimes(1);
  });

  it('records the GraphQL operation a POST request selected, for the span name', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: 'query first { __typename } query second { __typename }',
        operationName: 'second',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(recordGraphQLOperationMock).toHaveBeenCalledOnce();
    const [document, operationName] = recordGraphQLOperationMock.mock.calls[0] as [
      { definitions: unknown[] },
      string | undefined,
    ];
    expect(document.definitions).toHaveLength(2);
    expect(operationName).toBe('second');
  });

  it('reads the operation name from the query string on a GET request', async () => {
    const res = await app!.inject({
      method: 'GET',
      url: '/graphql',
      query: { query: 'query probe { __typename }', operationName: 'probe' },
    });

    expect(res.statusCode).toBe(200);
    expect(recordGraphQLOperationMock).toHaveBeenCalledWith(expect.anything(), 'probe');
  });
});

/**
 * The JEF-353 diagnostic. Two apps, because the hook is registered (or not) at
 * wiring time — which is the point of the env var: a Cloud Run env change
 * makes a new revision without an image build.
 */
describe('buildApp inbound traceparent diagnostic', () => {
  const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
  const SPAN_ID = '00f067aa0ba902b7';
  const traceparent = (flags: string): string => `00-${TRACE_ID}-${SPAN_ID}-${flags}`;

  let enabledApp: FastifyInstance;
  let disabledApp: FastifyInstance;
  let lines: Array<Record<string, unknown>> = [];

  /** Production pino runs at `warn`, so the test logger does too. */
  const capturingApp = (): FastifyInstance =>
    Fastify({
      logger: {
        level: 'warn',
        stream: {
          write: (line: string) => {
            lines.push(JSON.parse(line) as Record<string, unknown>);
          },
        },
      },
    });

  const diagnosticLines = (): Array<Record<string, unknown>> =>
    lines.filter((line) => line.event === INBOUND_TRACEPARENT_EVENT);

  beforeAll(async () => {
    process.env[ENV.LOG_INBOUND_TRACEPARENT] = 'true';
    enabledApp = await buildApp(capturingApp());
    await enabledApp.ready();

    delete process.env[ENV.LOG_INBOUND_TRACEPARENT];
    disabledApp = await buildApp(capturingApp());
    await disabledApp.ready();
  });

  afterAll(async () => {
    await enabledApp.close();
    await disabledApp.close();
  });

  beforeEach(() => {
    lines = [];
  });

  it('logs sampled: true for a header ending in -01', async () => {
    const res = await enabledApp.inject({
      method: 'GET',
      url: ROUTES.HEALTH,
      headers: { traceparent: traceparent('01') },
    });

    expect(res.statusCode).toBe(200);
    expect(diagnosticLines()).toHaveLength(1);
    expect(diagnosticLines()[0]).toMatchObject({
      level: 40,
      traceparent: traceparent('01'),
      sampled: true,
      hasCloudTraceContext: false,
    });
  });

  it('logs sampled: false for a header ending in -00', async () => {
    await enabledApp.inject({
      method: 'GET',
      url: ROUTES.HEALTH,
      headers: { traceparent: traceparent('00') },
    });

    expect(diagnosticLines()[0]).toMatchObject({ sampled: false });
  });

  it('reports x-cloud-trace-context, which Cloud Run injects alongside', async () => {
    await enabledApp.inject({
      method: 'GET',
      url: ROUTES.HEALTH,
      headers: {
        traceparent: traceparent('01'),
        'x-cloud-trace-context': `${TRACE_ID}/1234567890;o=1`,
      },
    });

    expect(diagnosticLines()[0]).toMatchObject({ hasCloudTraceContext: true });
  });

  it('still logs, and does not fail the request, when the header is absent', async () => {
    const res = await enabledApp.inject({ method: 'GET', url: ROUTES.HEALTH });

    expect(res.statusCode).toBe(200);
    expect(diagnosticLines()).toHaveLength(1);
    expect(diagnosticLines()[0]).toMatchObject({ sampled: null });
    expect(diagnosticLines()[0]).not.toHaveProperty('traceparent');
  });

  it('does not fail the request when the header is malformed', async () => {
    const res = await enabledApp.inject({
      method: 'GET',
      url: ROUTES.HEALTH,
      headers: { traceparent: 'not-a-traceparent' },
    });

    expect(res.statusCode).toBe(200);
    expect(diagnosticLines()[0]).toMatchObject({
      traceparent: 'not-a-traceparent',
      sampled: null,
    });
  });

  it('logs nothing when the diagnostic is not turned on', async () => {
    const res = await disabledApp.inject({
      method: 'GET',
      url: ROUTES.HEALTH,
      headers: { traceparent: traceparent('01') },
    });

    expect(res.statusCode).toBe(200);
    expect(diagnosticLines()).toEqual([]);
  });
});
