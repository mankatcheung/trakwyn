import { posix } from 'node:path';

/**
 * What the rewriters need to know about the tree. Every path is relative to
 * `apps/web` and uses `/`, so `src/lib/x.ts` and `../../content/y.md` are both
 * valid. The CLI builds this from `git ls-files` and the mapping; tests build it
 * from a literal list.
 */
export interface RewriteEnv {
  /** Final path of `path`, or `path` itself when it has not moved (or never will). */
  renamed(path: string): string;
  isFile(path: string): boolean;
  isDir(path: string): boolean;
}

/** Where a file is while it is being rewritten, and where it was before the move. */
export interface FileLocation {
  /** Directories to resolve relative specifiers from, tried in order. */
  resolveFrom: readonly string[];
  /** The directory the file sits in once the rewrite is done. */
  finalDir: string;
}

/** How a specifier reached its target, so the new one can be written the same way. */
type Via = 'exact' | 'extension' | 'index';

interface Resolved {
  target: string;
  via: Via;
}

export interface SpecifierResult {
  /** The specifier to write, or null when the current one is already right. */
  next: string | null;
}

const PROBE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.graphql'];
const ALIAS_PREFIX = '#/';
const ALIAS_ROOT = 'src';

function resolveFile(env: RewriteEnv, path: string): Resolved | null {
  if (env.isFile(path)) return { target: path, via: 'exact' };
  for (const ext of PROBE_EXTENSIONS) {
    if (env.isFile(path + ext)) return { target: path + ext, via: 'extension' };
  }
  for (const ext of PROBE_EXTENSIONS) {
    const index = posix.join(path, `index${ext}`);
    if (env.isFile(index)) return { target: index, via: 'index' };
  }
  return null;
}

/** `foo.ts` → `foo`, `a/b.css` → `a/b`. */
function stripExtension(path: string): string {
  const ext = posix.extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

function spellTarget(via: Via, target: string): string {
  if (via === 'exact') return target;
  if (via === 'extension') return stripExtension(target);
  return posix.basename(target).startsWith('index.')
    ? posix.dirname(target)
    : stripExtension(target);
}

function relativeSpecifier(fromDir: string, to: string): string {
  const rel = posix.relative(fromDir, to) || '.';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function splitQuery(specifier: string): [string, string] {
  const at = specifier.indexOf('?');
  return at === -1 ? [specifier, ''] : [specifier.slice(0, at), specifier.slice(at)];
}

export function isRewritable(specifier: string): boolean {
  return (
    specifier.startsWith(ALIAS_PREFIX) || specifier.startsWith('./') || specifier.startsWith('../')
  );
}

/**
 * Work out the specifier a file should write now that its target and/or the file
 * itself may have moved. Leaves anything it cannot resolve (packages, virtual
 * modules) alone, and returns `next: null` when the text is already correct, so
 * a second run changes nothing.
 */
export function rewriteSpecifier(
  specifier: string,
  location: FileLocation,
  env: RewriteEnv,
): SpecifierResult {
  if (!isRewritable(specifier)) return { next: null };
  const [path, query] = splitQuery(specifier);

  if (path.startsWith(ALIAS_PREFIX)) {
    const resolved = resolveFile(env, posix.join(ALIAS_ROOT, path.slice(ALIAS_PREFIX.length)));
    if (!resolved) return { next: null };
    const moved = env.renamed(resolved.target);
    if (moved === resolved.target) return { next: null };
    const spelled = spellTarget(resolved.via, moved);
    if (!spelled.startsWith(`${ALIAS_ROOT}/`)) return { next: null };
    return { next: ALIAS_PREFIX + spelled.slice(ALIAS_ROOT.length + 1) + query };
  }

  for (const base of location.resolveFrom) {
    const resolved = resolveFile(env, posix.join(base, path));
    if (!resolved) continue;
    const moved = env.renamed(resolved.target);
    if (moved === resolved.target && base === location.finalDir) return { next: null };
    const next = relativeSpecifier(location.finalDir, spellTarget(resolved.via, moved)) + query;
    return { next: next === specifier ? null : next };
  }
  return { next: null };
}

/**
 * The same job for a path built from `import.meta.dirname` (`resolve(dirname,
 * '../../x')`): the target may be a file or a directory, and a directory never
 * moves as a whole, so only the way to reach it can change.
 */
export function rewriteDirnamePath(
  segments: readonly string[],
  location: FileLocation,
  env: RewriteEnv,
): string[] | null {
  for (const base of location.resolveFrom) {
    const target = posix.join(base, ...segments);
    if (!env.isFile(target) && !env.isDir(target)) continue;
    const moved = env.isFile(target) ? env.renamed(target) : target;
    if (moved === target && base === location.finalDir) return null;
    const rel = posix.relative(location.finalDir, moved) || '.';
    const next = segments.length === 1 ? [rel] : rel.split('/');
    return next.join('/') === segments.join('/') ? null : next;
  }
  return null;
}

/** `import.meta.glob('../../x/*.md')`: a pattern only depends on where the file sits. */
export function rewriteGlobPattern(pattern: string, location: FileLocation): string | null {
  if (!pattern.startsWith('./') && !pattern.startsWith('../')) return null;
  const [base] = location.resolveFrom;
  if (base === undefined || base === location.finalDir) return null;
  return relativeSpecifier(location.finalDir, posix.join(base, pattern));
}

/**
 * Where a specifier points, as a path relative to `apps/web`, or null for a
 * package or anything that does not resolve. Used by checks that need to know
 * what a file imports rather than to rewrite it.
 */
export function resolveSpecifierTarget(
  specifier: string,
  fromDir: string,
  env: RewriteEnv,
): string | null {
  if (!isRewritable(specifier)) return null;
  const [path] = splitQuery(specifier);
  const joined = path.startsWith(ALIAS_PREFIX)
    ? posix.join(ALIAS_ROOT, path.slice(ALIAS_PREFIX.length))
    : posix.join(fromDir, path);
  return resolveFile(env, joined)?.target ?? null;
}
