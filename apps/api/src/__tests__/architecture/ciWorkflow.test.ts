import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shape of `.github/workflows/ci.yml` that a safe deploy relies on
 * (JEF-476). None of this can be run on a laptop, so what is held here is the
 * wiring a later edit could quietly undo: a deploy that stops waiting for its
 * gates, a gated job that `ci-ok` forgets, a promotion that moves before the
 * smoke test. Like the other workflow tests it reads the text, since the repo
 * has no YAML parser.
 */

const REPO = join(process.cwd(), '..', '..');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

const ci = read('.github/workflows/ci.yml');

/** Every job under `jobs:`, from its `  <name>:` line to the next job. */
function jobs(): Map<string, string> {
  const section = ci.slice(ci.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const starts = [...section.matchAll(/^ {2}([a-z][\w-]*):\n/gm)];
  const out = new Map<string, string>();
  starts.forEach((match, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : section.length;
    out.set(match[1], section.slice(match.index, end));
  });
  return out;
}

const job = (name: string): string => {
  const block = jobs().get(name);
  if (!block) throw new Error(`ci.yml has no ${name} job`);
  return block;
};

/** The names in a job's `needs:`, written inline as `needs: [a, b]` or `needs: a`. */
function needsOf(name: string): string[] {
  const match = /^ {4}needs:\s*(?:\[([^\]]*)\]|(\S+))/m.exec(job(name));
  if (!match) return [];
  return (match[1] ?? match[2]).split(',').map((n) => n.trim());
}

describe('ci.yml job hygiene', () => {
  it('is read-only unless a job asks for more', () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('gives every job a timeout, so a hang cannot hold a runner for six hours', () => {
    for (const [name, block] of jobs()) {
      expect(block, name).toMatch(/^ {4}timeout-minutes: \d+$/m);
    }
  });

  it('cancels a superseded pull request run but never a run on main', () => {
    expect(ci).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
    expect(ci).toContain("github.event.pull_request.number || 'main'");
  });
});

describe('ci.yml gates', () => {
  const deploys = ['migrate-db', 'deploy-api', 'deploy-web'];

  it('makes every deploy step wait for lint, build and test, and the browser tests', () => {
    for (const name of deploys) {
      expect(needsOf(name), name).toEqual(
        expect.arrayContaining(['quality', 'build', 'test', 'mobile-integration', 'e2e']),
      );
    }
  });

  it('runs build, test and mobile-integration in parallel, not one after another (JEF-478)', () => {
    expect(ci).not.toContain('build-test');
    for (const name of ['build', 'test', 'mobile-integration']) {
      expect(needsOf(name), name).toEqual(['changes']);
    }
  });

  it('keeps the extension .env, which only the build needs, out of the test job', () => {
    expect(job('build')).toContain('apps/extension/.env');
    expect(job('test')).not.toContain('apps/extension/.env');
  });

  it('only deploys from a push to main, not from a pull request that merged', () => {
    for (const name of [...deploys, 'notify-deploy']) {
      expect(job(name), name).toContain(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
    }
  });

  it('starts e2e without waiting for lint or the build', () => {
    expect(needsOf('e2e')).toEqual(['changes']);
  });

  // JEF-486: the suite is split across runners. A shard list that drifts from
  // the `--shard` count would run some specs twice or not at all.
  it('shards e2e, with every shard running its own slice and keeping its own report', () => {
    const e2e = job('e2e');
    const shards = /^ {8}shard: \[([\d,\s]+)\]/m.exec(e2e);
    expect(shards, 'e2e needs a shard matrix').not.toBeNull();
    const numbers = shards![1].split(',').map((n) => Number(n.trim()));
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    expect(numbers.length).toBeGreaterThan(1);
    expect(e2e).toMatch(/fail-fast: false/);
    expect(e2e).toContain('test:e2e --shard=${{ matrix.shard }}/${{ strategy.job-total }}');
    expect(e2e).toContain('name: playwright-report-${{ matrix.shard }}');
  });

  // JEF-490: e2e drives apps/web against apps/api, so a pull request that
  // touches only mobile, the extension or the CLI cannot affect it.
  it('gates e2e on its own filter, which leaves out mobile, the extension and the CLI', () => {
    expect(job('e2e')).toContain("if: needs.changes.outputs.e2e == 'true'");
    const filters = job('changes');
    const block = filters.slice(
      filters.indexOf('            e2e:'),
      filters.indexOf('            mobile:'),
    );
    expect(block).toContain("'apps/web/**'");
    expect(block).toContain("'apps/api/**'");
    expect(block).toContain("'packages/**'");
    expect(block).not.toMatch(/apps\/(mobile|extension|cli)/);
  });

  it('never skips a job on a push to main, whatever files it touched', () => {
    const outputs = job('changes').slice(
      job('changes').indexOf('outputs:'),
      job('changes').indexOf('steps:'),
    );
    const lines = outputs.split('\n').filter((l) => /^ {6}\w+:/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("github.event_name != 'pull_request' && 'true'");
    }
  });

  it('lists in ci-ok every job that can be skipped, or a skipped gate would stop being required', () => {
    const gated = [...jobs()]
      .filter(([name, block]) => name !== 'ci-ok' && block.includes('needs.changes.outputs'))
      .map(([name]) => name);
    expect(gated.length).toBeGreaterThan(0);
    expect(needsOf('ci-ok')).toEqual(expect.arrayContaining(['changes', 'quality', ...gated]));
  });

  it('fails ci-ok for a failed or cancelled job and passes a skipped one', () => {
    const block = job('ci-ok');
    expect(block).toContain('if: always()');
    expect(block).toContain('.result == "failure" or .result == "cancelled"');
    expect(block).not.toContain('"skipped"');
  });
});

describe('deploy-api promotion', () => {
  const block = job('deploy-api');

  it('deploys the revision with a tag and no traffic', () => {
    expect(block).toContain('no_traffic: true');
    expect(block).toContain('tag: ${{ env.REVISION_TAG }}');
  });

  it('tests the revision before any traffic moves to it', () => {
    const smoke = block.indexOf('.github/scripts/smoke-test.sh api');
    const promote = block.indexOf('--to-latest');
    expect(smoke).toBeGreaterThan(block.indexOf('deploy-cloudrun'));
    expect(promote).toBeGreaterThan(smoke);
  });

  it('removes the tag only after the promotion, and does not fail the deploy if it cannot', () => {
    const remove = block.indexOf('--remove-tags');
    expect(remove).toBeGreaterThan(block.indexOf('--to-latest'));
    expect(block.slice(remove)).toContain('||');
  });
});

describe('notify-deploy', () => {
  const block = job('notify-deploy');

  it('runs after a failed job, so a failed deploy is not silent', () => {
    expect(block).toContain('!cancelled()');
    expect(needsOf('notify-deploy')).toEqual(
      expect.arrayContaining([
        'quality',
        'build',
        'test',
        'mobile-integration',
        'e2e',
        'migrate-db',
        'deploy-api',
        'deploy-web',
      ]),
    );
  });

  it('says a failure is one, at high priority', () => {
    expect(block).toContain('Production deploy FAILED');
    expect(block).toContain('Priority: high');
  });
});

describe('vercel-deploy-production', () => {
  const action = read('.github/actions/vercel-deploy-production/action.yml');

  it('pins the Vercel CLI instead of tracking latest', () => {
    expect(action).toMatch(/npm install -g vercel@\d+\.\d+\.\d+$/m);
    expect(action).not.toContain('vercel@latest');
  });

  it('notes the live deployment before deploying, so there is one to go back to', () => {
    expect(action.indexOf('id: previous')).toBeGreaterThan(-1);
    expect(action.indexOf('id: previous')).toBeLessThan(action.indexOf('vercel deploy --prebuilt'));
  });

  it('smoke tests after the deploy and rolls back to the noted deployment on failure', () => {
    const smoke = action.indexOf('smoke-test.sh web');
    expect(smoke).toBeGreaterThan(action.indexOf('vercel deploy --prebuilt'));
    expect(action.indexOf('vercel rollback "$PREVIOUS"')).toBeGreaterThan(smoke);
    expect(action).toContain("steps.smoke.outcome == 'failure'");
  });

  it('still fails the job after a rollback, so the run is red', () => {
    const rollback = action.indexOf('vercel rollback');
    expect(action.slice(rollback)).toMatch(/exit 1/);
  });
});
