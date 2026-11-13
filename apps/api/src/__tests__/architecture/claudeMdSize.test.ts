import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every CLAUDE.md is loaded into the model's context whenever someone works
 * under its directory, so a long one is a tax on every task there. apps/api's
 * grew to 103 KB (JEF-512) before anyone noticed, because nothing measured it.
 *
 * The shape this test holds:
 *   - the root file and each app's file stay short, and say where detail lives;
 *   - detail sits in a nested CLAUDE.md in the directory that owns the code,
 *     which loads only when someone works there;
 *   - a runbook that is read for one task (releasing) is a docs/ file with a
 *     trigger line in its parent, not a CLAUDE.md.
 *
 * Going over a limit is a decision that has to be written down below, the same
 * shape as `fileSize.test.ts`.
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

/** The root file and `apps/<name>/CLAUDE.md`: read for every task in that app. */
const APP_LEVEL_MAX_BYTES = 20 * 1024;

/** A CLAUDE.md under `src/` or another subdirectory: read only in that directory. */
const NESTED_MAX_BYTES = 16 * 1024;

/** Over the limit on purpose, keyed by path from the repo root, with the reason. */
const OVERSIZED_BY_DESIGN: Record<string, string> = {};

/** Directories that are never source: dependencies, build output, other checkouts. */
const SKIPPED = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);

function claudeFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      // Dot directories hold git data, tool state and sibling worktrees
      // (.claude/worktrees), none of which is this checkout's documentation.
      if (entry.startsWith('.') || SKIPPED.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'CLAUDE.md') found.push(full);
    }
  };
  walk(REPO_ROOT);
  return found;
}

const idOf = (file: string): string => relative(REPO_ROOT, file).split(sep).join('/');

const isAppLevel = (id: string): boolean =>
  id === 'CLAUDE.md' || /^apps\/[^/]+\/CLAUDE\.md$/.test(id);

const limitOf = (id: string): number => (isAppLevel(id) ? APP_LEVEL_MAX_BYTES : NESTED_MAX_BYTES);

const sizeOf = (file: string): number => Buffer.byteLength(readFileSync(file, 'utf8'), 'utf8');

const overLimit = (): Array<{ id: string; bytes: number }> =>
  claudeFiles()
    .map((file) => ({ id: idOf(file), bytes: sizeOf(file) }))
    .filter(({ id, bytes }) => bytes > limitOf(id));

describe('CLAUDE.md size', () => {
  it('walked a realistic set of files', () => {
    // A wrong working directory would walk nothing and pass everything below.
    const ids = claudeFiles().map(idOf);
    expect(ids).toContain('CLAUDE.md');
    expect(ids).toContain('apps/api/CLAUDE.md');
    expect(ids.length).toBeGreaterThan(5);
  });

  it('keeps every file under its limit unless it is listed', () => {
    const unlisted = overLimit()
      .filter(({ id }) => !(id in OVERSIZED_BY_DESIGN))
      .map(({ id, bytes }) => `${id} is ${bytes} bytes, over ${limitOf(id)}`);

    expect(unlisted).toEqual([]);
  });

  it('has no stale entries in the oversized list', () => {
    const stillOver = new Set(overLimit().map(({ id }) => id));
    const shrunk = Object.keys(OVERSIZED_BY_DESIGN).filter((id) => !stillOver.has(id));

    expect(shrunk).toEqual([]);
  });

  it('gives a real reason for every exemption', () => {
    const unexplained = Object.entries(OVERSIZED_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([id]) => id);

    expect(unexplained).toEqual([]);
  });
});

describe('AGENTS.md', () => {
  /**
   * Agents that read AGENTS.md instead of CLAUDE.md (JEF-564) get one root
   * file that points at the CLAUDE.md notes. It stays a pointer: small, naming
   * CLAUDE.md, and every repo path it names is real.
   */
  const AGENTS_MAX_BYTES = 2 * 1024;
  const agentsPath = join(REPO_ROOT, 'AGENTS.md');
  const text = (): string => readFileSync(agentsPath, 'utf8');

  it('exists at the repo root and stays under 2 KB', () => {
    expect(existsSync(agentsPath)).toBe(true);
    expect(sizeOf(agentsPath)).toBeLessThanOrEqual(AGENTS_MAX_BYTES);
  });

  it('names CLAUDE.md', () => {
    expect(text()).toContain('CLAUDE.md');
  });

  it('only names repo paths that exist', () => {
    const paths = [...text().matchAll(/`([^`\s]+)`/g)]
      .map((match) => match[1])
      .filter((token) => token.includes('/') || token.endsWith('.md'))
      // Slash commands such as `/rename` are not paths.
      .filter((token) => !token.startsWith('/'));

    expect(paths.length).toBeGreaterThan(0);
    const missing = paths.filter((p) => !existsSync(join(REPO_ROOT, p)));
    expect(missing).toEqual([]);
  });
});

describe('CLAUDE.md pointers', () => {
  /**
   * A file moved out of a CLAUDE.md and renamed later leaves a pointer to
   * nowhere, and nothing else would notice. Only paths that end in CLAUDE.md or
   * sit under a docs/ directory are checked; a pointer is resolved against the
   * repo root, the file's own directory and each app's root or `src/`.
   */
  const POINTER = /`((?:[\w.-]+\/)*(?:CLAUDE\.md|docs\/[\w./-]+\.md))`/g;

  const bases = (file: string): string[] => [
    REPO_ROOT,
    dirname(file),
    ...['api', 'web', 'mobile', 'extension'].flatMap((app) => [
      join(REPO_ROOT, 'apps', app),
      join(REPO_ROOT, 'apps', app, 'src'),
    ]),
  ];

  it('every CLAUDE.md or docs/ path a CLAUDE.md names exists', () => {
    const dangling: string[] = [];
    for (const file of claudeFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(POINTER)) {
        const target = match[1];
        if (!bases(file).some((base) => existsSync(join(base, target)))) {
          dangling.push(`${idOf(file)} -> ${target}`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });
});
