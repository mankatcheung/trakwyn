import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';

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

describe('buildApp observability flush hook', () => {
  let app: FastifyInstance | undefined;
  let closeDb: (() => Promise<void>) | undefined;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of [ENV.AXIOM_TOKEN, ENV.AXIOM_DATASET]) {
      previousEnv[key] = process.env[key];
    }

    process.env[ENV.DATABASE_URL] = 'pglite:memory';
    const client = await import('#src/infrastructure/db/client.js');
    closeDb = client.closeDb;
    await applyMigrations(client.db);

    process.env[ENV.JWT_SECRET] = 'test-secret';
    process.env[ENV.JWT_REFRESH_SECRET] = 'test-refresh-secret';

    const { buildApp } = await import('#src/http/buildApp.js');
    app = await buildApp(Fastify({ logger: false }));
    await app.ready();
  });

  afterAll(async () => {
    for (const key of [ENV.AXIOM_TOKEN, ENV.AXIOM_DATASET]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    await app?.close();
    await closeDb?.();
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
