// Shrinks the production node_modules that `pnpm deploy --prod` writes, for
// the API image (apps/api/Dockerfile). Run as: node prune-store.mjs <out-dir>
//
// Why it is needed: drizzle-orm declares ~27 optional peer dependencies
// (Prisma, PGlite, libSQL, MySQL, ...). The workspace resolves some of them
// (dev dependencies, or auto-installed peers), so pnpm links them into
// drizzle-orm's virtual-store folder and the install pulls in their whole
// trees (Prisma, TypeScript, effect, ...) — hundreds of MB the API never loads.
//
// Two steps:
//   1. Cut drizzle-orm's links to every peer except the ones the API uses.
//   2. Mark everything still reachable from the app's direct dependencies
//      and delete the rest of node_modules/.pnpm.
//
// It then checks that no package it kept has a broken link, so a peer that is
// really needed fails the image build instead of failing at runtime.
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// drizzle-orm peers the API really uses. Everything else is cut.
const KEPT_DRIZZLE_PEERS = new Set(['pg', '@types/pg', '@opentelemetry/api', '@upstash/redis']);

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node prune-store.mjs <out-dir>');
  process.exit(2);
}

const nodeModules = join(outDir, 'node_modules');
const store = join(nodeModules, '.pnpm');
if (!existsSync(store)) {
  console.error(`no pnpm virtual store at ${store}`);
  process.exit(2);
}

/** Every `<dir>/<name>` and `<dir>/@scope/<name>` entry, as [name, path]. */
function packageEntries(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.bin' || entry.name === '.pnpm' || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (!entry.name.startsWith('@')) return [[entry.name, path]];
    return readdirSync(path).map((name) => [`${entry.name}/${name}`, join(path, name)]);
  });
}

/** The `.pnpm/<folder>` a path lives in, or null when it is outside the store. */
function storeFolderOf(path) {
  const rel = relative(store, path);
  if (rel.startsWith('..') || rel === '') return null;
  const folder = rel.split(sep)[0];
  return folder === 'node_modules' ? null : folder;
}

// Step 1: cut the unused drizzle-orm peers.
let cut = 0;
for (const folder of readdirSync(store).filter((name) => name.startsWith('drizzle-orm@'))) {
  for (const [name, path] of packageEntries(join(store, folder, 'node_modules'))) {
    if (name === 'drizzle-orm' || KEPT_DRIZZLE_PEERS.has(name)) continue;
    if (lstatSync(path).isSymbolicLink()) {
      rmSync(path);
      cut += 1;
    }
  }
}

// Step 2: mark what is reachable from the app's direct dependencies.
const reachable = new Set();
const queue = packageEntries(nodeModules)
  .map(([, path]) => storeFolderOf(realpathSync(path)))
  .filter((folder) => folder !== null);

while (queue.length > 0) {
  const folder = queue.pop();
  if (reachable.has(folder)) continue;
  reachable.add(folder);
  for (const [, path] of packageEntries(join(store, folder, 'node_modules'))) {
    if (!lstatSync(path).isSymbolicLink()) continue;
    const target = storeFolderOf(realpathSync(path));
    if (target !== null && target !== folder) queue.push(target);
  }
}

let removed = 0;
for (const folder of readdirSync(store)) {
  if (folder === 'node_modules' || reachable.has(folder)) continue;
  if (!lstatSync(join(store, folder)).isDirectory()) continue;
  rmSync(join(store, folder), { recursive: true, force: true });
  removed += 1;
}

// `.pnpm/node_modules` holds hoisted links to every package; drop the ones
// that now point at nothing.
const hoisted = join(store, 'node_modules');
if (existsSync(hoisted)) {
  for (const [, path] of packageEntries(hoisted)) {
    if (!existsSync(path)) rmSync(path, { force: true });
  }
}

// Verify: nothing we kept may have a broken link. The cut drizzle-orm peers
// were removed as links in step 1, so they do not show up here.
const broken = [];
for (const folder of reachable) {
  for (const [name, path] of packageEntries(join(store, folder, 'node_modules'))) {
    if (!existsSync(path)) broken.push(`${folder} -> ${name}`);
  }
}
for (const [name, path] of packageEntries(nodeModules)) {
  if (!existsSync(path)) broken.push(`node_modules -> ${name}`);
}

console.log(
  `prune-store: cut ${cut} drizzle-orm peer links, kept ${reachable.size} packages, removed ${removed}`,
);
if (broken.length > 0) {
  console.error(`prune-store: broken links after pruning:\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
