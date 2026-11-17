/**
 * Move files to their new feature-first paths and rewrite everything that names
 * them (JEF-627 / JEF-628).
 *
 *   node scripts/move-files.ts [--only <new-path-prefix>]... [--dry-run] [--mapping <file>]
 *
 * Run from `apps/web`. Rows come from `scripts/restructure-mapping.tsv` (old and
 * new path, relative to `src/`). `--only features/profile/` moves just the rows
 * whose new path starts with that prefix; give it more than once to combine areas.
 *
 * Idempotent: a row whose file is already at its new path is skipped, and every
 * specifier is re-resolved from where the file sits now and where it started, so
 * running again on any branch fixes imports that still name an old path and
 * changes nothing else.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createEnv } from './lib/createEnv.ts';
import { filterMoves, onlyMoves, parseMapping, type MappingRow } from './lib/mapping.ts';
import { rewriteMentions } from './lib/rewriteMentions.ts';
import { rewriteTypeScript } from './lib/rewriteTypeScript.ts';
import type { FileLocation } from './lib/resolveSpecifier.ts';

const WEB = 'apps/web';
const CODE_FILE = /\.(?:tsx?|mts|mjs)$/;
const SKIPPED_CODE = /(?:^|\/)(?:node_modules|generated|dist|coverage)\/|routeTree\.gen\.ts$/;
/** Markdown the move script keeps in step; `apps/mobile` and `apps/extension` are Phase 7. */
const DOC_FILES = [
  /^CLAUDE\.md$/,
  /^DESIGN\.md$/,
  /^docs\/.+\.md$/,
  /^content\/README\.md$/,
  /^infra\/posthog\/README\.md$/,
];

interface Options {
  mappingFile: string;
  only: string[];
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    mappingFile: 'scripts/restructure-mapping.tsv',
    only: [],
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--only' || arg === '--mapping') {
      const value = argv[(i += 1)];
      if (!value) throw new Error(`${arg} needs a value`);
      if (arg === '--only') options.only.push(value);
      else options.mappingFile = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function listFiles(root: string): string[] {
  return git(root, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}

/** Move the selected rows with `git mv`; returns the new paths moved by this run. */
function moveRows(root: string, rows: readonly MappingRow[], dryRun: boolean): Set<string> {
  const movedNow = new Set<string>();
  for (const { from, to } of rows) {
    const oldPath = join(root, WEB, 'src', from);
    const newPath = join(root, WEB, 'src', to);
    const [hasOld, hasNew] = [existsSync(oldPath), existsSync(newPath)];
    if (!hasOld && hasNew) continue;
    if (hasOld && hasNew) throw new Error(`both exist: ${from} and ${to}`);
    if (!hasOld) throw new Error(`neither exists: ${from} -> ${to}`);
    if (!dryRun) {
      mkdirSync(dirname(newPath), { recursive: true });
      git(root, ['mv', oldPath, newPath]);
    }
    movedNow.add(`src/${to}`);
  }
  return movedNow;
}

function locationOf(
  webPath: string,
  inverse: ReadonlyMap<string, string>,
  movedNow: ReadonlySet<string>,
): FileLocation {
  const original = inverse.get(webPath) ?? webPath;
  const dirs = [dirname(webPath), dirname(original)];
  // A file this run just moved still has the imports it was written with, so
  // they resolve from where it started; any other file is already consistent.
  const ordered = movedNow.has(webPath) ? dirs.reverse() : dirs;
  return { resolveFrom: [...new Set(ordered)], finalDir: dirname(webPath) };
}

function isMentionFile(repoPath: string): boolean {
  if (DOC_FILES.some((pattern) => pattern.test(repoPath))) return true;
  if (!repoPath.startsWith(`${WEB}/`)) return false;
  const web = repoPath.slice(WEB.length + 1);
  if (web.startsWith('scripts/') || web === 'CHANGELOG.md' || SKIPPED_CODE.test(web)) return false;
  return web.endsWith('.md') || (!web.startsWith('src/') && /\.(?:json|mjs|ts|sh)$/.test(web));
}

function rewriteAll(
  root: string,
  rows: readonly MappingRow[],
  movedNow: ReadonlySet<string>,
): string[] {
  const repoFiles = listFiles(root);
  const env = createEnv(repoFiles, rows);
  const inverse = new Map(rows.map((row) => [`src/${row.to}`, `src/${row.from}`]));
  const changed: string[] = [];

  for (const repoPath of repoFiles) {
    const isCode =
      repoPath.startsWith(`${WEB}/`) && CODE_FILE.test(repoPath) && !SKIPPED_CODE.test(repoPath);
    if (!isCode && !isMentionFile(repoPath)) continue;
    const absolute = join(root, repoPath);
    if (!existsSync(absolute)) continue;
    const before = readFileSync(absolute, 'utf8');
    const webPath = repoPath.startsWith(`${WEB}/`) ? repoPath.slice(WEB.length + 1) : repoPath;
    let after = before;
    if (isCode)
      after = rewriteTypeScript(after, repoPath, locationOf(webPath, inverse, movedNow), env);
    if (isMentionFile(repoPath)) after = rewriteMentions(after, env);
    if (after === before) continue;
    writeFileSync(absolute, after);
    changed.push(repoPath);
  }
  return changed;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const all = parseMapping(readFileSync(options.mappingFile, 'utf8'));
  const selected = filterMoves(onlyMoves(all), options.only);

  const movedNow = moveRows(root, selected, options.dryRun);
  if (options.dryRun) {
    console.log(`dry run: ${movedNow.size} of ${selected.length} selected files would move`);
    return;
  }
  const changed = rewriteAll(root, all, movedNow);
  console.log(
    `moved ${movedNow.size} files (${selected.length} selected); rewrote ${changed.length} files`,
  );
}

main();
