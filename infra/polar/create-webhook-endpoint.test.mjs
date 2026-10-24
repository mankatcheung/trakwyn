// Run with: node --test infra/polar/create-webhook-endpoint.test.mjs (not part of CI)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTS,
  buildBody,
  checkUrl,
  createEndpoint,
  differences,
} from './create-webhook-endpoint.mjs';

const URL_OK = 'https://api.trakwyn.com/billing/webhook';

/** A fake Polar: `existing` is what GET lists; a POST is recorded and answered like Polar does. */
function fakePolar(existing = [], created = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body });
    if ((init.method ?? 'GET') === 'GET') {
      return Response.json({
        items: existing,
        pagination: { total_count: existing.length, max_page: 1 },
      });
    }
    return Response.json(
      { id: 'wh-1', secret: 'whsec_new', uses_standard_webhook_signature: true, ...created },
      { status: 201 },
    );
  };
  return { calls, fetchImpl };
}

const run = (fetchImpl, overrides = {}) =>
  createEndpoint({
    url: URL_OK,
    name: 'Trakwyn API',
    server: 'sandbox',
    token: 'tok',
    apply: true,
    fetchImpl,
    ...overrides,
  });

test('subscribes to exactly the events the API acts on, as raw payloads on the pinned version', () => {
  assert.deepEqual(buildBody({ url: URL_OK, name: 'Trakwyn API' }), {
    url: URL_OK,
    name: 'Trakwyn API',
    format: 'raw',
    api_version: '2026-10',
    events: [
      'subscription.active',
      'subscription.uncanceled',
      'subscription.canceled',
      'subscription.revoked',
      'order.paid',
      'order.refunded',
    ],
  });
});

test('checkUrl accepts a public https URL and refuses http, localhost and non-URLs', () => {
  assert.equal(checkUrl(URL_OK).hostname, 'api.trakwyn.com');
  assert.throws(() => checkUrl('http://api.trakwyn.com/billing/webhook'), /must be https/);
  assert.throws(() => checkUrl('https://localhost:3001/billing/webhook'), /cannot reach localhost/);
  assert.throws(() => checkUrl('nope'), /is not a URL/);
});

test('a dry run lists endpoints and creates nothing', async () => {
  const { calls, fetchImpl } = fakePolar();
  const result = await run(fetchImpl, { apply: false });

  assert.equal(result.status, 'would create');
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});

test('apply creates the endpoint on the right server and returns the secret once', async () => {
  const { calls, fetchImpl } = fakePolar();
  const result = await run(fetchImpl);

  assert.deepEqual(
    [result.status, result.id, result.secret, result.problems],
    ['created', 'wh-1', 'whsec_new', []],
  );
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.url, 'https://sandbox-api.polar.sh/v1/webhooks/endpoints');
  assert.equal(post.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(post.body).events, EVENTS);
});

test('an endpoint already registered for the URL is left alone and its secret is not returned', async () => {
  const existing = [
    { id: 'wh-0', url: URL_OK, format: 'raw', enabled: true, events: EVENTS, secret: 'whsec_old' },
  ];
  const { calls, fetchImpl } = fakePolar(existing);
  const result = await run(fetchImpl);

  assert.deepEqual(
    [result.status, result.id, result.secret, result.problems],
    ['exists', 'wh-0', null, []],
  );
  assert.equal(
    calls.some((c) => c.method === 'POST'),
    false,
  );
});

test('an existing endpoint that is disabled or lacks events is reported, not changed', async () => {
  const existing = [
    { id: 'wh-0', url: URL_OK, format: 'raw', enabled: false, events: ['order.paid'] },
  ];
  const { fetchImpl } = fakePolar(existing);
  const result = await run(fetchImpl);

  assert.equal(result.status, 'exists');
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /missing events: .*subscription\.active/);
  assert.match(result.problems[1], /disabled/);
});

test('differences also reports a payload format other than raw', () => {
  assert.match(
    differences({ events: EVENTS, format: 'slack', enabled: true })[0],
    /format "slack"/,
  );
});

test('warns when Polar signs with the old scheme, which the API rejects', async () => {
  const { fetchImpl } = fakePolar([], { uses_standard_webhook_signature: false });
  const result = await run(fetchImpl);

  assert.match(result.problems[0], /old .*scheme/);
});

test('a refusal from Polar stops the run and names the field', async () => {
  const fetchImpl = async (url, init = {}) =>
    (init.method ?? 'GET') === 'GET'
      ? Response.json({ items: [], pagination: { total_count: 0, max_page: 1 } })
      : new Response('{"detail":[{"loc":["body","url"],"msg":"bad"}]}', { status: 422 });

  await assert.rejects(run(fetchImpl), /422 for POST \/webhooks\/endpoints.*url/s);
});

test('an unusable URL fails before any request is made', async () => {
  const { calls, fetchImpl } = fakePolar();
  await assert.rejects(run(fetchImpl, { url: 'http://localhost:3001/billing/webhook' }), /https/);
  assert.equal(calls.length, 0);
});
