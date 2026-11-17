import { posix } from 'node:path';
import type { MappingRow } from './mapping.ts';
import type { RewriteEnv } from './resolveSpecifier.ts';

const WEB_ROOT = 'apps/web';

/**
 * Build a `RewriteEnv` from the files that exist right now (repo-relative, as
 * `git ls-files` prints them) and the whole mapping (relative to `apps/web/src`).
 *
 * A path that no longer exists but is an old path in the mapping resolves to its
 * new path, which is what makes a re-run fix imports a previous run left behind.
 */
export function createEnv(repoFiles: Iterable<string>, rows: readonly MappingRow[]): RewriteEnv {
  const files = new Set(repoFiles);
  const dirs = new Set<string>();
  for (const file of files) {
    for (let dir = posix.dirname(file); dir !== '.' && !dirs.has(dir); dir = posix.dirname(dir)) {
      dirs.add(dir);
    }
  }
  const renames = new Map(rows.map((row) => [`src/${row.from}`, `src/${row.to}`]));
  const toRepo = (path: string): string => posix.join(WEB_ROOT, path);
  const exists = (path: string): boolean => files.has(toRepo(path));
  const movedAway = (path: string): string | null => {
    const next = renames.get(path);
    return next !== undefined && !exists(path) && exists(next) ? next : null;
  };

  return {
    // An old path whose file has already moved still counts as a file, so a
    // stale import of it can be resolved and pointed at the new place.
    isFile: (path) => exists(path) || movedAway(path) !== null,
    isDir: (path) => dirs.has(toRepo(path)),
    renamed: (path) => movedAway(path) ?? path,
  };
}
