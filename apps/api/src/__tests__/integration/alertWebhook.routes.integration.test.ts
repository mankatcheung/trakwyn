import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ROUTES } from '#src/http/constants.js';
import { ENV, LINEAR } from '#src/infrastructure/config/constants.js';

/**
 * The relay end to end through the real app (JEF-382): Fastify's JSON body,
 * the DI container's use case, rate limiter and `LinearIssueTracker`, with
 * only Linear's HTTP API faked.
 */

const SECRET = 'a'.repeat(32);

const body = {
  action: 'Open',
  monitorId: 'mon1',
  title: 'Scheduled job failed',
  description: 'A job threw.',
  timestamp: '2026-09-30T10:00:05Z',
  queryStartTime: '',
  queryEndTime: '',
  value: '0',
  matchedEvent: {
    attributes: {
      event: 'job.digest.failed',
      err: { type: 'Error', message: 'boom', stack: 'Error: boom\n    at run (x.js:1:1)' },
    },
  },
  groupKeys: null,
  groupValues: null,
};

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });

describe('POST /webhooks/axiom-alerts (integration)', () => {
  let testApp: TestApp;
  const linearCalls: Array<{ query: string; variables: Record<string, unknown> }> = [];

  beforeAll(async () => {
    process.env[ENV.ALERT_WEBHOOK_SECRET] = SECRET;
    process.env[ENV.LINEAR_API_KEY] = 'lin_api_test';
    process.env[ENV.LINEAR_TEAM_ID] = 'team-uuid';

    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== LINEAR.API_URL) return realFetch(input, init);
      const call = JSON.parse(init!.body as string) as (typeof linearCalls)[number];
      linearCalls.push(call);
      return call.query.includes('issueCreate')
        ? json({
            data: { issueCreate: { success: true, issue: { identifier: 'JEF-500', url: 'u' } } },
          })
        : json({ data: { issues: { nodes: [] } } });
    });

    testApp = await buildTestApp();
  });

  afterEach(() => {
    linearCalls.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env[ENV.ALERT_WEBHOOK_SECRET];
    delete process.env[ENV.LINEAR_API_KEY];
    delete process.env[ENV.LINEAR_TEAM_ID];
    await testApp.cleanup();
  });

  const post = (authorization: string) =>
    testApp.app.inject({
      method: 'POST',
      url: ROUTES.AXIOM_ALERT_WEBHOOK,
      headers: { host: 'localhost:3001', authorization, 'content-type': 'application/json' },
      payload: body,
    });

  it('refuses a wrong secret without calling Linear', async () => {
    const res = await post('Bearer wrong');

    expect(res.statusCode).toBe(401);
    expect(linearCalls).toEqual([]);
  });

  it('searches for an open issue, then files one with the error in it', async () => {
    const res = await post(`Bearer ${SECRET}`);

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ outcome: 'created', issue: 'JEF-500' });
    expect(linearCalls).toHaveLength(2);

    const [search, create] = linearCalls;
    const fingerprint = search!.variables.fingerprint as string;
    expect(fingerprint).toMatch(/^axiom-mon1-/);

    const input = create!.variables.input as { teamId: string; title: string; description: string };
    expect(input.teamId).toBe('team-uuid');
    expect(input.title).toBe('[Axiom] Scheduled job failed: Error — boom');
    expect(input.description).toContain('Error: boom\n    at run (x.js:1:1)');
    expect(input.description).toContain(fingerprint);
  });
});
