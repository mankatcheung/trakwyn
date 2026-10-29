import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

/**
 * JEF-472: a document the schema refuses is a stale client, not a server
 * fault. Before, `formatError` took Mercurius's wrapper for an unexpected
 * error and the client got "Internal server error" with no field named.
 */

interface GraphQLResponse {
  data: unknown;
  errors?: Array<{ message: string; extensions?: { code?: string; statusCode?: number } }>;
}

describe('GraphQL validation failures (JEF-472)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  async function post(payload: Record<string, unknown>) {
    return testApp.app.inject({ method: 'POST', url: '/graphql', payload });
  }

  it('answers an unknown field with the schema message, coded VALIDATION', async () => {
    const res = await post({
      query: 'query Stale { thisFieldWasRemoved }',
      operationName: 'Stale',
    });

    const body = res.json<GraphQLResponse>();
    expect(res.statusCode).toBe(200);
    expect(body.errors).toHaveLength(1);
    expect(body.errors?.[0]?.message).toContain('thisFieldWasRemoved');
    expect(body.errors?.[0]?.extensions?.code).toBe(ERROR_CODES.VALIDATION);
    expect(body.errors?.[0]?.extensions?.statusCode).toBe(400);
    expect(JSON.stringify(body)).not.toContain('Internal server error');
  });

  it('answers every validation error in the document, not just the first', async () => {
    const res = await post({ query: '{ firstGone secondGone }' });

    const messages = res.json<GraphQLResponse>().errors?.map((e) => e.message) ?? [];
    expect(messages.some((m) => m.includes('firstGone'))).toBe(true);
    expect(messages.some((m) => m.includes('secondGone'))).toBe(true);
  });

  it('answers a syntax error with its message too (Mercurius wraps it the same way)', async () => {
    const res = await post({ query: '{ ' });

    const body = res.json<GraphQLResponse>();
    expect(body.errors?.[0]?.message).toMatch(/Syntax Error/i);
  });
});
