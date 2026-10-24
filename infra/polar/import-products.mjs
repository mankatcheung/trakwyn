#!/usr/bin/env node
// Creates the products in a JSON file in Polar (JEF-432), so the sandbox and
// production are set up from the same file instead of by hand.
//
//   POLAR_ACCESS_TOKEN=... node import-products.mjs products.json --server sandbox            # dry run
//   POLAR_ACCESS_TOKEN=... node import-products.mjs products.json --server sandbox --apply    # create
//
// Dry run is the default. --server has no default, like POLAR_SERVER: a token for
// one environment is never pointed at the other by omission. A product that
// already exists (same metadata.trakwyn_key, else the same name) is left alone,
// never updated, so re-running is safe. The ids are printed as the env lines the
// API reads. The token is read from the environment only and is never printed.
//
// Each product's "prices" is sent to Polar exactly as written, so any price shape
// the API accepts works here. See README.md for the file format.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const API_URL = {
  sandbox: 'https://sandbox-api.polar.sh/v1',
  production: 'https://api.polar.sh/v1',
};
export const API_VERSION = '2026-10';
const KEY_METADATA = 'trakwyn_key';
const ENV_VAR = /^POLAR_PRODUCT_[A-Z0-9_]+$/;

/** Parses and checks the file. Throws one Error listing every problem found. */
export function parseProducts(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`The file is not valid JSON: ${err.message}`);
  }
  const products = Array.isArray(data) ? data : data?.products;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('The file must be a list of products, or { "products": [...] }');
  }

  const problems = [];
  const keys = new Set();
  products.forEach((product, i) => {
    const at = `product ${i + 1}${product?.key ? ` (${product.key})` : ''}`;
    if (typeof product?.key !== 'string' || !product.key) problems.push(`${at}: "key" is required`);
    else if (keys.has(product.key)) problems.push(`${at}: "key" ${product.key} is used twice`);
    else keys.add(product.key);
    if (typeof product?.name !== 'string' || product.name.length < 3 || product.name.length > 64) {
      problems.push(`${at}: "name" must be 3 to 64 characters`);
    }
    if (!Array.isArray(product?.prices) || product.prices.length === 0) {
      problems.push(`${at}: "prices" needs at least one price`);
    }
    if (product?.envVar !== undefined && !ENV_VAR.test(product.envVar)) {
      problems.push(`${at}: "envVar" must look like POLAR_PRODUCT_MONTHLY`);
    }
  });
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return products;
}

/** The request body for one product. `key` and `envVar` are ours; the rest goes to Polar. */
export function buildBody({ key, envVar: _envVar, metadata, ...product }) {
  return { ...product, metadata: { ...metadata, [KEY_METADATA]: key } };
}

/** The existing product for `product`, by key and then by name; archived ones do not count. */
export function findExisting(product, existing) {
  const live = existing.filter((candidate) => !candidate.is_archived);
  return (
    live.find((candidate) => candidate.metadata?.[KEY_METADATA] === product.key) ??
    live.find((candidate) => candidate.name === product.name)
  );
}

export async function call(fetchImpl, server, token, path, init = {}) {
  const res = await fetchImpl(`${API_URL[server]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Polar-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Polar's validation message says which field is wrong, and carries nothing secret.
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Polar answered ${res.status} for ${init.method ?? 'GET'} ${path}: ${detail.slice(0, 500)}`,
    );
  }
  return res.json();
}

async function listExisting(fetchImpl, server, token) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const result = await call(fetchImpl, server, token, `/products/?limit=100&page=${page}`);
    items.push(...result.items);
    if (page >= result.pagination.max_page) return items;
  }
}

/**
 * Plans, and with `apply` performs, the creation. Returns one result per product:
 * { key, name, envVar, status: 'exists' | 'would create' | 'created', id }.
 */
export async function importProducts({ products, server, token, apply, fetchImpl = fetch }) {
  const existing = await listExisting(fetchImpl, server, token);
  const results = [];
  for (const product of products) {
    const found = findExisting(product, existing);
    const base = { key: product.key, name: product.name, envVar: product.envVar };
    if (found) {
      results.push({ ...base, status: 'exists', id: found.id });
    } else if (!apply) {
      results.push({ ...base, status: 'would create', id: null });
    } else {
      const created = await call(fetchImpl, server, token, '/products/', {
        method: 'POST',
        body: JSON.stringify(buildBody(product)),
      });
      results.push({ ...base, status: 'created', id: created.id });
    }
  }
  return results;
}

export function envLines(results) {
  return results
    .filter((result) => result.envVar && result.id)
    .map((result) => `${result.envVar}=${result.id}`);
}

function parseArgs(argv) {
  const args = { file: undefined, server: undefined, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--server') args.server = argv[(i += 1)];
    else if (!argv[i].startsWith('--') && !args.file) args.file = argv[i];
    else throw new Error(`Unknown argument ${argv[i]}`);
  }
  if (!args.file)
    throw new Error(
      'Usage: import-products.mjs <products.json> --server sandbox|production [--apply]',
    );
  if (!(args.server in API_URL)) throw new Error('--server must be "sandbox" or "production"');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is not set');

  const products = parseProducts(await readFile(args.file, 'utf8'));
  console.log(
    `${args.apply ? 'Creating' : 'Dry run for'} ${products.length} products on Polar ${args.server}`,
  );
  const results = await importProducts({ products, server: args.server, token, apply: args.apply });
  for (const result of results) {
    console.log(`  ${result.status.padEnd(12)} ${result.name}${result.id ? `  ${result.id}` : ''}`);
  }
  const lines = envLines(results);
  if (lines.length > 0) {
    console.log(
      '\nSet these for the API (apps/api/.env, or plain_env in infra/gcp/terraform.tfvars):',
    );
    for (const line of lines) console.log(line);
  }
  if (!args.apply) console.log('\nNothing was created. Add --apply to create the products above.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
