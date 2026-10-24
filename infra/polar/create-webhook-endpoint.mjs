#!/usr/bin/env node
// Creates the webhook endpoint Trakwyn needs in Polar (JEF-432), subscribed to
// exactly the events the API acts on (apps/api/src/infrastructure/billing/polarWebhookEvents.ts).
//
//   POLAR_ACCESS_TOKEN=... node create-webhook-endpoint.mjs https://<api origin>/billing/webhook --server sandbox            # dry run
//   POLAR_ACCESS_TOKEN=... node create-webhook-endpoint.mjs https://<api origin>/billing/webhook --server sandbox --apply    # create
//
// The token needs the `webhooks:write` scope (and `webhooks:read` to find an
// existing endpoint, which `write` includes). Dry run is the default and --server
// has no default, as in import-products.mjs. An endpoint already registered for
// the same URL is left alone, never changed, and its secret is not printed: take
// it from the Polar dashboard. A new endpoint's `whsec_…` secret is printed once,
// as the POLAR_WEBHOOK_SECRET line the API reads; it is a credential, so put it in
// apps/api/.env or Secret Manager and clear your scrollback if the terminal is shared.
import { pathToFileURL } from 'node:url';
import { API_VERSION, call } from './import-products.mjs';

/** What the API acts on; every other event is acknowledged and ignored, so none is subscribed. */
export const EVENTS = [
  'subscription.active',
  'subscription.uncanceled',
  'subscription.canceled',
  'subscription.revoked',
  'order.paid',
  'order.refunded',
];

/** The request body. `api_version` is pinned to the shape the mapper's tests are written for. */
export function buildBody({ url, name }) {
  return { url, name, format: 'raw', api_version: API_VERSION, events: EVENTS };
}

/** Throws unless `url` is a public https URL, which is all Polar can deliver to. */
export function checkUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error('The webhook URL must be https');
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Polar cannot reach localhost: use a public https URL, such as a tunnel');
  }
  return parsed;
}

/** What differs between an existing endpoint and the one we want; empty when they match. */
export function differences(existing) {
  const problems = [];
  const missing = EVENTS.filter((event) => !existing.events?.includes(event));
  if (missing.length > 0) problems.push(`is missing events: ${missing.join(', ')}`);
  if (existing.format !== 'raw') problems.push(`has format "${existing.format}", not "raw"`);
  if (existing.enabled === false) problems.push('is disabled');
  return problems;
}

async function listEndpoints(fetchImpl, server, token) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await call(
      fetchImpl,
      server,
      token,
      `/webhooks/endpoints?limit=100&page=${page}`,
    );
    items.push(...result.items);
    if (page >= result.pagination.max_page) return items;
  }
}

/**
 * Plans, and with `apply` performs, the creation. Returns
 * { status: 'exists' | 'would create' | 'created', id, secret, problems }.
 * `secret` is only set for a created endpoint.
 */
export async function createEndpoint({ url, name, server, token, apply, fetchImpl = fetch }) {
  checkUrl(url);
  const existing = (await listEndpoints(fetchImpl, server, token)).find(
    (endpoint) => endpoint.url === url,
  );
  if (existing) {
    return { status: 'exists', id: existing.id, secret: null, problems: differences(existing) };
  }
  if (!apply) return { status: 'would create', id: null, secret: null, problems: [] };

  const created = await call(fetchImpl, server, token, '/webhooks/endpoints', {
    method: 'POST',
    body: JSON.stringify(buildBody({ url, name })),
  });
  // False means Polar signs with its original scheme, which the API's verifier does not accept.
  const problems =
    created.uses_standard_webhook_signature === false
      ? [
          'signs with the old (pre-Standard Webhooks) scheme, which the API rejects: create the endpoint again',
        ]
      : [];
  return { status: 'created', id: created.id, secret: created.secret, problems };
}

function parseArgs(argv) {
  const args = { url: undefined, server: undefined, name: 'Trakwyn API', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--server') args.server = argv[(i += 1)];
    else if (argv[i] === '--name') args.name = argv[(i += 1)];
    else if (!argv[i].startsWith('--') && !args.url) args.url = argv[i];
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!args.url) {
    throw new Error(
      'Usage: create-webhook-endpoint.mjs <https://api origin/billing/webhook> --server sandbox|production [--name <name>] [--apply]',
    );
  }
  if (!['sandbox', 'production'].includes(args.server))
    throw new Error('--server must be "sandbox" or "production"');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set');

  console.log(
    `${args.apply ? 'Creating' : 'Dry run for'} the webhook endpoint ${args.url} on Polar ${args.server}`,
  );
  console.log(`Events: ${EVENTS.join(', ')}`);
  const result = await createEndpoint({ ...args, token });
  console.log(`  ${result.status}${result.id ? `  ${result.id}` : ''}`);
  for (const problem of result.problems) console.log(`  WARNING: the endpoint ${problem}`);

  if (result.secret) {
    console.log(
      '\nSet this for the API (apps/api/.env, or Secret Manager as polar-webhook-secret):',
    );
    console.log(`POLAR_WEBHOOK_SECRET=${result.secret}`);
  } else if (result.status === 'exists') {
    console.log('\nIt already exists and was not changed. Its secret is in the Polar dashboard.');
  } else {
    console.log('\nNothing was created. Add --apply to create it.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
