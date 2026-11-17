/** One row of `restructure-mapping.tsv`: paths relative to `apps/web/src`. */
export interface MappingRow {
  from: string;
  to: string;
}

export function parseMapping(tsv: string): MappingRow[] {
  const rows = tsv
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => {
      const cells = line.split('\t');
      if (cells.length !== 2 || cells.some((cell) => cell === '')) {
        throw new Error(`mapping line ${index + 1} is not "old<TAB>new": ${JSON.stringify(line)}`);
      }
      return { from: cells[0]!, to: cells[1]! };
    });
  assertUnique(
    rows.map((row) => row.from),
    'old path',
  );
  assertUnique(
    rows.map((row) => row.to),
    'new path',
  );
  return rows;
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`mapping lists the same ${label} twice: ${value}`);
    seen.add(value);
  }
}

export function onlyMoves(rows: readonly MappingRow[]): MappingRow[] {
  return rows.filter((row) => row.from !== row.to);
}

/** Keep the moves whose new path starts with one of `prefixes` (all of them when none is given). */
export function filterMoves(
  rows: readonly MappingRow[],
  prefixes: readonly string[],
): MappingRow[] {
  if (prefixes.length === 0) return [...rows];
  return rows.filter((row) => prefixes.some((prefix) => row.to.startsWith(prefix)));
}
