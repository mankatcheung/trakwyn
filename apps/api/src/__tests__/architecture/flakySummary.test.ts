import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `.github/scripts/flaky-summary.sh` turns Playwright's JSON report into the
 * job-summary list of tests that passed only on a retry (JEF-489). It is run
 * here against reports of the real shape, because a script that printed
 * "None" for every input would make the whole report decoration.
 */

const REPO = join(process.cwd(), '..', '..');
const SCRIPT = join(REPO, '.github/scripts/flaky-summary.sh');
const run = promisify(execFile);

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface FakeTest {
  title: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  attempts: number;
}

/** A report shaped like Playwright's: a file suite, optional describe suites, specs. */
function report(file: string, describe: string | null, tests: FakeTest[]): unknown {
  const specs = tests.map((t, i) => ({
    title: t.title,
    file,
    line: 10 + i,
    tests: [{ status: t.status, results: Array.from({ length: t.attempts }, () => ({})) }],
  }));
  const inner = describe ? { title: describe, specs, suites: [] } : null;
  return {
    suites: [{ title: file, file, specs: inner ? [] : specs, suites: inner ? [inner] : [] }],
  };
}

async function summary(json: unknown, label?: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'flaky-'));
  dirs.push(dir);
  const path = join(dir, 'results.json');
  writeFileSync(path, JSON.stringify(json));
  const { stdout } = await run(SCRIPT, label ? [path, label] : [path]);
  return stdout;
}

describe('flaky-summary.sh', () => {
  it('lists a test that passed only on a retry, with its file, full title and attempts', async () => {
    const out = await summary(
      report('board.spec.ts', 'Board drag-and-drop', [
        { title: 'moves a card', status: 'flaky', attempts: 2 },
        { title: 'steady one', status: 'expected', attempts: 1 },
      ]),
      'shard 2/4',
    );
    expect(out).toContain('### Flaky e2e tests (shard 2/4)');
    expect(out).toContain('Passed only on a retry (1)');
    expect(out).toContain('| `board.spec.ts:10` | Board drag-and-drop › moves a card | 2 |');
    expect(out).not.toContain('steady one');
  });

  it('does not list tests that passed first time, failed outright or were skipped', async () => {
    const out = await summary(
      report('a.spec.ts', null, [
        { title: 'passes', status: 'expected', attempts: 1 },
        { title: 'fails', status: 'unexpected', attempts: 2 },
        { title: 'skipped', status: 'skipped', attempts: 0 },
      ]),
    );
    expect(out).toContain('### Flaky e2e tests');
    expect(out).toContain('None. Every test passed on its first attempt.');
    expect(out).not.toContain('| Spec |');
  });

  it('escapes a pipe in a title so the table keeps its columns', async () => {
    const out = await summary(
      report('a.spec.ts', null, [{ title: 'a | b', status: 'flaky', attempts: 2 }]),
    );
    expect(out).toContain('a \\| b');
  });

  it('says so, and still succeeds, when there is no results file', async () => {
    const { stdout } = await run(SCRIPT, [join(tmpdir(), 'flaky-missing', 'results.json')]);
    expect(stdout).toContain('could not be checked');
  });
});

describe('flaky test reporting is wired into CI (JEF-489)', () => {
  const config = readFileSync(join(REPO, 'apps/web/playwright.config.ts'), 'utf8');
  const ci = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

  it('retries once in CI, not twice', () => {
    expect(config).toMatch(/retries: process\.env\.CI \? 1 : 0/);
  });

  it('writes the JSON report the script reads, where the script is pointed', () => {
    expect(config).toContain("outputFile: 'test-results/results.json'");
    expect(ci).toContain('flaky-summary.sh apps/web/test-results/results.json');
  });

  it('lists flaky tests even when the run failed, and only reports', () => {
    const step = /- name: List flaky tests\n([\s\S]*?)\n\n/.exec(ci);
    expect(step, 'ci.yml needs a "List flaky tests" step').not.toBeNull();
    expect(step![1]).toContain('if: always()');
    expect(step![1]).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(step![1]).not.toContain('continue-on-error');
  });
});
