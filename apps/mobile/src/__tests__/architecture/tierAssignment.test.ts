import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Every test file has to belong to exactly one tier (JEF-300).
 *
 * jest.config.js splits the suites into projects by convention — .test.ts is
 * unit, .test.tsx is component, src/__integration__ is integration — and a
 * convention that nothing checks is one a single off-convention file quietly
 * breaks. A suite matched by no project does not fail: it stops running, and
 * CI stays green while covering less than it did yesterday. That is the exact
 * failure mode apps/api's architecture tests exist to prevent, so mobile gets
 * the same guard.
 *
 * This asks Jest itself rather than re-implementing testMatch against the
 * config: `--listTests` reports the files the next CI run will actually
 * execute, which is the only question worth asking.
 */

const PACKAGE_ROOT = resolve(__dirname, '../../..');
const SEARCH_ROOTS = ['src', 'app'];
const TEST_FILE = /\.test\.tsx?$/;

/** Every test file on disk, whether or not any project claims it. */
function testFilesOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
      } else if (TEST_FILE.test(entry.name)) {
        found.push(path);
      }
    }
  };
  for (const root of SEARCH_ROOTS) walk(join(PACKAGE_ROOT, root));
  return found.sort();
}

/**
 * One line per (project, test file) pair, so a file claimed by two projects
 * appears twice — which is how the duplicate check below sees it.
 */
function testFilesJestWillRun(): string[] {
  const stdout = execFileSync(process.execPath, [require.resolve('jest/bin/jest'), '--listTests'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

describe('test tier assignment', () => {
  const onDisk = testFilesOnDisk();
  const willRun = testFilesJestWillRun();

  it('finds test files to check', () => {
    // Guards the guard: a walk that matched nothing would pass every
    // assertion below while checking nothing at all.
    expect(onDisk.length).toBeGreaterThan(50);
  });

  it('runs every test file in some tier', () => {
    const orphans = onDisk.filter((file) => !willRun.includes(file));
    expect(orphans.map((f) => f.replace(`${PACKAGE_ROOT}/`, ''))).toEqual([]);
  });

  it('runs every test file in only one tier', () => {
    const seen = new Set<string>();
    const duplicates = willRun.filter((file) => !seen.add(file));
    expect(duplicates.map((f) => f.replace(`${PACKAGE_ROOT}/`, ''))).toEqual([]);
  });

  it('runs nothing that is not a test file on disk', () => {
    const unexpected = willRun.filter((file) => !onDisk.includes(file));
    expect(unexpected.map((f) => f.replace(`${PACKAGE_ROOT}/`, ''))).toEqual([]);
  });
});
