/** One built JavaScript file, e.g. `dashboard-BlMUdjic.js` is name `dashboard`. */
export interface BuiltChunk {
  name: string;
  bytes: number;
}

export interface ChunkBaseline {
  /** What produced these numbers, so a stale baseline is recognisable. */
  recordedWith: string;
  /** Chunks named after a route file, sorted by name then size. */
  routeChunks: BuiltChunk[];
}

export interface ChunkReport {
  /** Route chunks the baseline had and the build no longer has: the check fails on these. */
  missing: string[];
  /** Route chunks that grew by more than the tolerance: reported, never failing. */
  grown: Array<{ name: string; before: number; after: number }>;
}

/** A route chunk may grow this much before it is mentioned. */
export const GROWTH_TOLERANCE = 0.2;

/** `dashboard-BlMUdjic.js` → `dashboard`; null for anything that is not a hashed `.js` file. */
export function chunkName(fileName: string): string | null {
  const match = /^(.+)-[A-Za-z0-9_-]{8}\.js$/.exec(fileName);
  return match ? match[1]! : null;
}

/**
 * The name a route file's chunk gets: its file name without extension, `$`
 * written as `_`. `index` is skipped, because every folder has one and the
 * names cannot be told apart.
 */
export function routeChunkName(routeFile: string): string | null {
  const segments = routeFile.split('/');
  const base = segments.at(-1) ?? '';
  const stem = base.replace(/\.(?:tsx?|jsx?)$/, '');
  // A `-` prefix anywhere in the path means the router ignores the file.
  if (segments.some((segment) => segment.startsWith('-'))) return null;
  if (stem === base || stem === 'index' || stem.includes('.')) return null;
  return stem.replaceAll('$', '_');
}

export function pickRouteChunks(
  built: readonly BuiltChunk[],
  routeNames: ReadonlySet<string>,
): BuiltChunk[] {
  return built
    .filter((chunk) => routeNames.has(chunk.name))
    .sort((a, b) => a.name.localeCompare(b.name) || a.bytes - b.bytes);
}

function groupByName(chunks: readonly BuiltChunk[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const { name, bytes } of chunks) {
    groups.set(
      name,
      [...(groups.get(name) ?? []), bytes].sort((a, b) => a - b),
    );
  }
  return groups;
}

/**
 * Compare a build with the baseline. A route that had a chunk of its own and has
 * none now was folded into another chunk, which moves its code into the first
 * paint of whatever imported it; that is the regression this exists to catch.
 */
export function compareChunks(baseline: ChunkBaseline, built: readonly BuiltChunk[]): ChunkReport {
  const before = groupByName(baseline.routeChunks);
  const after = groupByName(built);
  const missing: string[] = [];
  const grown: ChunkReport['grown'] = [];

  for (const [name, sizes] of before) {
    const now = after.get(name) ?? [];
    if (now.length < sizes.length) missing.push(name);
    sizes.forEach((size, i) => {
      const current = now[i];
      if (current !== undefined && current > size * (1 + GROWTH_TOLERANCE)) {
        grown.push({ name, before: size, after: current });
      }
    });
  }
  return { missing: missing.sort(), grown };
}
