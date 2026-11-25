import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ENV } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';

/**
 * JEF-689: one `graphql operation` line per GraphQL request, before it runs,
 * with observability off (the e2e API's case; `tracing.js` is not mocked, so
 * `isObservabilityEnabled` is false here).
 */
const OPERATION_LINE = 'graphql operation';

let closeDb: (() => Promise<void>) | undefined;
let app: FastifyInstance;
let lines: Array<Record<string, unknown>> = [];

const operationLines = (): Array<Record<string, unknown>> =>
  lines.filter((line) => line.msg === OPERATION_LINE);

beforeAll(async () => {
  process.env[ENV.DATABASE_URL] = 'pglite:memory';
  const client = await import('#src/infrastructure/db/client.js');
  closeDb = client.closeDb;
  await applyMigrations(client.db);

  process.env[ENV.JWT_SECRET] = 'test-secret';
  process.env[ENV.JWT_REFRESH_SECRET] = 'test-refresh-secret';

  const { buildApp } = await import('#src/http/buildApp.js');
  app = await buildApp(
    Fastify({
      logger: {
        level: 'info',
        stream: {
          write: (line: string) => {
            lines.push(JSON.parse(line) as Record<string, unknown>);
          },
        },
      },
    }),
  );
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await closeDb?.();
});

beforeEach(() => {
  lines = [];
});

describe('buildApp graphql operation log line', () => {
  it('logs the operation type and name with the request id, before the response line', async () => {
    const res = await app.inject({
      method: 'POST',
      url: ROUTES.GRAPHQL,
      payload: { query: 'query probe { __typename }', operationName: 'probe' },
    });

    expect(res.statusCode).toBe(200);
    expect(operationLines()).toHaveLength(1);
    const [line] = operationLines();
    expect(line).toMatchObject({ level: 30, operation: 'query probe' });

    const incoming = lines.find((l) => l.msg === 'incoming request');
    const completed = lines.find((l) => l.msg === 'request completed');
    expect(line!.reqId).toBeDefined();
    expect(line!.reqId).toBe(incoming?.reqId);
    expect(line!.reqId).toBe(completed?.reqId);
    expect(lines.indexOf(line!)).toBeLessThan(lines.indexOf(completed!));
  });

  it('names the selected operation when the document has several', async () => {
    await app.inject({
      method: 'POST',
      url: ROUTES.GRAPHQL,
      payload: {
        query: 'query first { __typename } mutation second { __typename }',
        operationName: 'second',
      },
    });

    expect(operationLines()[0]).toMatchObject({ operation: 'mutation second' });
  });

  it('logs an anonymous operation by its type', async () => {
    await app.inject({
      method: 'GET',
      url: ROUTES.GRAPHQL,
      query: { query: '{ __typename }' },
    });

    expect(operationLines()[0]).toMatchObject({ operation: 'query' });
  });

  it('never logs variables or the query text', async () => {
    await app.inject({
      method: 'POST',
      url: ROUTES.GRAPHQL,
      payload: {
        query: 'query probe($secret: String) { __typename }',
        operationName: 'probe',
        variables: { secret: 'hunter2-password' },
      },
    });

    const serialised = JSON.stringify(operationLines());
    expect(serialised).not.toContain('hunter2-password');
    expect(serialised).not.toContain('__typename');
  });
});
