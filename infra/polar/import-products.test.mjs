// Run with: node --test infra/polar/import-products.test.mjs (not part of CI)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildBody,
  envLines,
  findExisting,
  importProducts,
  parseProducts,
} from './import-products.mjs';

const product = (overrides = {}) => ({
  key: 'monthly',
  envVar: 'POLAR_PRODUCT_MONTHLY',
  name: 'Trakwyn Pro monthly',
  recurring_interval: 'month',
  prices: [{ amount_type: 'fixed', price_currency: 'usd', price_amount: 1200 }],
  ...overrides,
});

/** A fake Polar: `existing` is what GET /products/ lists; POSTs are recorded and answered with ids. */
function fakePolar(existing = []) {
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
      { id: `new-${calls.filter((c) => c.method === 'POST').length}` },
      { status: 201 },
    );
  };
  return { calls, fetchImpl };
}

test('the example file is valid and names the four products the API reads', async () => {
  const products = parseProducts(
    await readFile(new URL('./products.example.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    products.map((p) => p.envVar),
    [
      'POLAR_PRODUCT_MONTHLY',
      'POLAR_PRODUCT_FOUNDER_MONTHLY',
      'POLAR_PRODUCT_PASS_3M',
      'POLAR_PRODUCT_PASS_6M',
    ],
  );
  // A pass is a one-off product: no recurring interval.
  assert.equal(products.find((p) => p.key === 'pass_3m').recurring_interval, undefined);
});

test('parseProducts accepts a bare list or { products }', () => {
  assert.equal(parseProducts(JSON.stringify([product()])).length, 1);
  assert.equal(parseProducts(JSON.stringify({ products: [product()] })).length, 1);
});

test('parseProducts lists every problem at once', () => {
  const bad = [
    product({ key: '' }),
    product({ name: 'ab', prices: [] }),
    product({ envVar: 'nope' }),
  ];
  assert.throws(
    () => parseProducts(JSON.stringify(bad)),
    (err) => {
      assert.match(err.message, /"key" is required/);
      assert.match(err.message, /"name" must be 3 to 64/);
      assert.match(err.message, /needs at least one price/);
      assert.match(err.message, /"envVar" must look like/);
      return true;
    },
  );
});

test('parseProducts refuses a repeated key, bad JSON and an empty file', () => {
  assert.throws(
    () => parseProducts(JSON.stringify([product(), product({ name: 'Another one' })])),
    /used twice/,
  );
  assert.throws(() => parseProducts('{'), /not valid JSON/);
  assert.throws(() => parseProducts('[]'), /list of products/);
});

test('buildBody sends prices as written and tags the key, keeping ours out of the body', () => {
  const body = buildBody(product({ metadata: { plan: 'pro' } }));
  assert.deepEqual(body, {
    name: 'Trakwyn Pro monthly',
    recurring_interval: 'month',
    prices: [{ amount_type: 'fixed', price_currency: 'usd', price_amount: 1200 }],
    metadata: { plan: 'pro', trakwyn_key: 'monthly' },
  });
});

test('findExisting matches by key, then by name, and skips archived products', () => {
  const byKey = { id: 'a', name: 'Renamed', metadata: { trakwyn_key: 'monthly' } };
  const byName = { id: 'b', name: 'Trakwyn Pro monthly', metadata: {} };
  assert.equal(findExisting(product(), [byName, byKey]).id, 'a');
  assert.equal(findExisting(product(), [byName]).id, 'b');
  assert.equal(findExisting(product(), [{ ...byName, is_archived: true }]), undefined);
});

test('a dry run creates nothing', async () => {
  const { calls, fetchImpl } = fakePolar();
  const results = await importProducts({
    products: [product()],
    server: 'sandbox',
    token: 't',
    apply: false,
    fetchImpl,
  });
  assert.deepEqual(
    results.map((r) => r.status),
    ['would create'],
  );
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET'],
  );
});

test('apply creates what is missing, on the right server, with the pinned version and token', async () => {
  const { calls, fetchImpl } = fakePolar();
  const results = await importProducts({
    products: [product()],
    server: 'sandbox',
    token: 'tok',
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(
    results.map((r) => [r.status, r.id]),
    [['created', 'new-1']],
  );
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.url, 'https://sandbox-api.polar.sh/v1/products/');
  assert.equal(post.headers.Authorization, 'Bearer tok');
  assert.equal(post.headers['Polar-Version'], '2026-10');
  assert.equal(JSON.parse(post.body).metadata.trakwyn_key, 'monthly');
});

test('apply leaves an existing product alone, so a re-run creates nothing', async () => {
  const { calls, fetchImpl } = fakePolar([
    { id: 'prod-1', name: 'Trakwyn Pro monthly', metadata: { trakwyn_key: 'monthly' } },
  ]);
  const results = await importProducts({
    products: [product()],
    server: 'production',
    token: 't',
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(
    results.map((r) => [r.status, r.id]),
    [['exists', 'prod-1']],
  );
  assert.equal(
    calls.some((c) => c.method === 'POST'),
    false,
  );
  assert.equal(calls[0].url.startsWith('https://api.polar.sh/v1/'), true);
});

test('a refusal from Polar stops the run and says which field it disliked', async () => {
  const fetchImpl = async (url, init = {}) =>
    (init.method ?? 'GET') === 'GET'
      ? Response.json({ items: [], pagination: { total_count: 0, max_page: 1 } })
      : new Response('{"detail":[{"loc":["body","prices"],"msg":"bad"}]}', { status: 422 });

  await assert.rejects(
    importProducts({
      products: [product()],
      server: 'sandbox',
      token: 't',
      apply: true,
      fetchImpl,
    }),
    /422 for POST \/products\/.*prices/s,
  );
});

test('envLines prints one line per product that has an id and an env name', () => {
  assert.deepEqual(
    envLines([
      { envVar: 'POLAR_PRODUCT_MONTHLY', id: 'a' },
      { envVar: 'POLAR_PRODUCT_PASS_3M', id: null },
      { envVar: undefined, id: 'c' },
    ]),
    ['POLAR_PRODUCT_MONTHLY=a'],
  );
});
