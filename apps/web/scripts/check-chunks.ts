/**
 * Guard the route code-splitting while files move (JEF-627).
 *
 *   pnpm build && pnpm check:chunks            # compare with scripts/chunk-baseline.json
 *   pnpm build && pnpm check:chunks --record   # rewrite the baseline from this build
 *
 * Fails when a route that had a chunk of its own in the baseline has none in the
 * build. Run it from `apps/web` after `pnpm build`.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chunkName,
  compareChunks,
  pickRouteChunks,
  routeChunkName,
  type BuiltChunk,
  type ChunkBaseline,
} from './lib/chunks.ts';

const BASELINE_FILE = 'scripts/chunk-baseline.json';
/** The Vercel build, then the plain build the e2e job uses. */
const ASSET_DIRS = ['.vercel/output/static/assets', 'dist/client/assets'];
const ROUTES_DIR = 'src/routes';

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function builtChunks(): BuiltChunk[] {
  const dir = ASSET_DIRS.find((candidate) => existsSync(candidate));
  if (!dir)
    throw new Error(
      `no build output found (looked in ${ASSET_DIRS.join(', ')}); run pnpm build first`,
    );
  return readdirSync(dir).flatMap((file) => {
    const name = chunkName(file);
    return name === null ? [] : [{ name, bytes: statSync(join(dir, file)).size }];
  });
}

function routeNames(): Set<string> {
  const names = listFiles(ROUTES_DIR).map(routeChunkName);
  return new Set(names.filter((name): name is string => name !== null));
}

function record(): void {
  const baseline: ChunkBaseline = {
    recordedWith: 'pnpm build (vite build, vercel preset)',
    routeChunks: pickRouteChunks(builtChunks(), routeNames()),
  };
  writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`recorded ${baseline.routeChunks.length} route chunks in ${BASELINE_FILE}`);
}

function check(): number {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as ChunkBaseline;
  const report = compareChunks(baseline, builtChunks());
  for (const { name, before, after } of report.grown) {
    console.warn(`note: route chunk ${name} grew from ${before} to ${after} bytes`);
  }
  if (report.missing.length > 0) {
    console.error(`route chunks lost their own chunk: ${report.missing.join(', ')}`);
    return 1;
  }
  console.log(`all ${baseline.routeChunks.length} baseline route chunks are present`);
  return 0;
}

if (process.argv.includes('--record')) record();
else process.exitCode = check();
