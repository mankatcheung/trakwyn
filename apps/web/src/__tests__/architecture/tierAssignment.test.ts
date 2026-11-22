import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Every test file has to belong to exactly one tier (JEF-665).
 *
 * vitest.config.ts splits the suites into projects: `integration` is
 * `src/__integration__`, `unit` is the rest. A file no project claims does not
 * fail, it stops running, and CI stays green while covering less than it did
 * yesterday; a file two projects claim runs twice, once under an environment it
 * was not written for. apps/mobile has the same guard.
 *
 * This asks Vitest itself (`vitest list`) rather than re-implementing `include`
 * and `exclude`: it reports the files the next CI run will execute, which is
 * the only question worth asking.
 */

const PACKAGE_ROOT = resolve(import.meta.dirname, '../../..');
const TEST_FILE = /\.test\.tsx?$/;
// `vitest/vitest.mjs` is the `bin` but not in `exports`, so go through package.json.
const VITEST_BIN = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
);

function testFilesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
      } else if (TEST_FILE.test(entry.name)) {
        found.push(relative(PACKAGE_ROOT, path));
      }
    }
  };
  walk(join(PACKAGE_ROOT, 'src'));
  return found.sort();
}

/** One entry per (project, file) pair, so a file claimed twice appears twice. */
function testFilesVitestWillRun(): string[] {
  const stdout = execFileSync(process.execPath, [VITEST_BIN, 'list', '--filesOnly'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return stdout
    .split('\n')
    .map((line) => line.match(/^\[[\w-]+\]\s+(.+\.test\.tsx?)$/)?.[1])
    .filter((file): file is string => file !== undefined)
    .sort();
}

describe('test tier assignment', () => {
  const onDisk = testFilesOnDisk();
  const willRun = testFilesVitestWillRun();

  it('finds test files to check', () => {
    // Guards the guard: a walk or a parse that matched nothing would pass every
    // assertion below while checking nothing at all.
    expect(onDisk.length).toBeGreaterThan(100);
    expect(willRun.length).toBeGreaterThan(100);
  });

  it('runs every test file in some tier', () => {
    expect(onDisk.filter((file) => !willRun.includes(file))).toEqual([]);
  });

  it('runs every test file in only one tier', () => {
    const seen = new Set<string>();
    expect(willRun.filter((file) => !seen.add(file))).toEqual([]);
  });

  it('runs nothing that is not a test file on disk', () => {
    expect(willRun.filter((file) => !onDisk.includes(file))).toEqual([]);
  });
});
