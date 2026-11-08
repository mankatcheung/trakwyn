import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guide automation (JEF-533): `guides-draft.yml` drafts a guide when the
 * web app is released, and `guides-freshness.yml` checks the existing guides
 * every week. Both open PRs and issues, so the rules that keep them safe are
 * held here, in the style of releaseVersioning.test.ts:
 *
 * - drafting starts only from a web release, inside release.yml (a release
 *   tagged with GITHUB_TOKEN starts no other workflow);
 * - PRs and issues are opened with a GitHub App token, because a PR opened with
 *   GITHUB_TOKEN does not start ci.yml, so `ci-ok` would never pass;
 * - neither workflow can push to main or merge anything.
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

/** One job of a workflow, up to the next job at the same indent. */
function jobBlock(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`No ${name} job`);
  const next = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

const release = read('.github/workflows/release.yml');
const draft = read('.github/workflows/guides-draft.yml');
const freshness = read('.github/workflows/guides-freshness.yml');
const WORKFLOWS = { 'guides-draft.yml': draft, 'guides-freshness.yml': freshness };

describe('release.yml draft-guide job (JEF-533)', () => {
  const job = jobBlock(release, 'draft-guide');

  it('exposes the web release outputs from release-please', () => {
    expect(release).toContain(
      "web_released: ${{ steps.release.outputs['apps/web--release_created'] }}",
    );
    expect(release).toContain("web_tag: ${{ steps.release.outputs['apps/web--tag_name'] }}");
  });

  it('runs only when this push released the web app', () => {
    expect(job).toContain("if: needs.release-please.outputs.web_released == 'true'");
    expect(job).toContain('needs: release-please');
  });

  it('calls the reusable workflow with the new tag and the secrets', () => {
    expect(job).toContain('uses: ./.github/workflows/guides-draft.yml');
    expect(job).toContain('tag: ${{ needs.release-please.outputs.web_tag }}');
    expect(job).toContain('secrets: inherit');
  });

  it('is not started by an event GITHUB_TOKEN cannot trigger', () => {
    expect(draft).not.toMatch(/^ {2}release:/m);
    expect(draft).toMatch(/^ {2}workflow_call:/m);
    expect(draft).toMatch(/^ {2}workflow_dispatch:/m);
  });
});

describe.each(Object.entries(WORKFLOWS))('%s', (_name, workflow) => {
  it('mints a GitHub App token from the guides App secrets', () => {
    expect(workflow).toContain('uses: actions/create-github-app-token@v2');
    expect(workflow).toContain('app-id: ${{ secrets.GUIDES_APP_ID }}');
    expect(workflow).toContain('private-key: ${{ secrets.GUIDES_APP_PRIVATE_KEY }}');
  });

  it('opens PRs and issues with the App token, not GITHUB_TOKEN', () => {
    const calls = workflow.split('\n').filter((line) => /gh (pr|issue) create/.test(line));
    expect(calls.length).toBeGreaterThan(0);
    // Every step that calls gh to create something sets GH_TOKEN to the App token.
    const stepsWithCreate = workflow
      .split(/\n {6}- /)
      .filter((step) => /gh (pr|issue) create/.test(step));
    for (const step of stepsWithCreate) {
      expect(step).toContain('GH_TOKEN: ${{ steps.app.outputs.token }}');
    }
    expect(workflow).not.toMatch(/GH_TOKEN: \$\{\{ (github\.token|secrets\.GITHUB_TOKEN) \}\}/);
  });

  it('gives GITHUB_TOKEN read access only', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).not.toMatch(/(contents|pull-requests|issues): write/);
  });

  it('keeps a push credential out of the checkout', () => {
    expect(workflow).toContain('persist-credentials: false');
  });

  it('pushes only chore/guide-* branches, never main', () => {
    const pushes = workflow
      .split('\n')
      .filter((line) => !line.trim().startsWith('#') && /\bgit push\b/.test(line));
    expect(pushes.length).toBeGreaterThan(0);
    for (const line of pushes) {
      expect(line).toMatch(/HEAD:refs\/heads\/\$branch/);
      expect(line).not.toMatch(/\bmain\b/);
    }
    for (const branch of workflow.matchAll(/branch=(\S+)/g)) {
      expect(branch[1]).toMatch(/^"?chore\/guide-/);
    }
  });

  it('never merges, closes or auto-merges a PR', () => {
    expect(workflow).not.toMatch(/gh pr (merge|close)/);
    expect(workflow).not.toMatch(/--auto\b|--admin\b/);
    expect(workflow).not.toMatch(/gh api [^\n]*merge/);
  });

  it('references actions by major version', () => {
    for (const use of workflow.matchAll(/uses: ([^\s@]+)@(\S+)/g)) {
      expect(use[2], use[0]).toMatch(/^v\d+$/);
    }
  });
});

describe('guides-draft.yml safety limits (JEF-533)', () => {
  it('skips when two or more guide draft PRs are open', () => {
    expect(draft).toContain("MAX_OPEN_DRAFTS: '2'");
    expect(draft).toContain('--label guide-draft --state open');
    expect(draft).toContain('-ge "$MAX_OPEN_DRAFTS"');
    // Every step after the count is skipped by it.
    const after = draft.slice(draft.indexOf('id: open'));
    const gated = ['actions/checkout@', 'guide-env', 'claude-code-action@', 'Open the draft'];
    for (const marker of gated) {
      const at = after.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      const step = after.slice(Math.max(0, after.lastIndexOf('\n      - ', at)), at + 400);
      expect(step, marker).toMatch(
        /steps\.(open\.outputs\.skip != 'true'|check\.outputs\.draft == 'true')/,
      );
    }
  });

  it('caps the cost: Sonnet 5.5 and a turn limit', () => {
    expect(draft).toContain('CLAUDE_MODEL: claude-sonnet-5-5');
    expect(draft).toMatch(/CLAUDE_MAX_TURNS: '\d+'/);
    const turns = Number(/CLAUDE_MAX_TURNS: '(\d+)'/.exec(draft)?.[1]);
    expect(turns).toBeLessThanOrEqual(40);
    expect(draft).toContain('--max-turns ${{ env.CLAUDE_MAX_TURNS }}');
  });

  it('gives Claude no push credential and no arbitrary shell', () => {
    const step = draft.slice(draft.indexOf('uses: anthropics/claude-code-action@v1'));
    const claude = step.slice(0, step.indexOf('# Never trust'));
    expect(claude).toContain('github_token: ${{ github.token }}');
    expect(claude).not.toContain('steps.app.outputs.token');
    const tools = /--allowedTools "([^"]+)"/.exec(claude)?.[1] ?? '';
    expect(tools).not.toBe('');
    expect(tools).not.toMatch(/(^|,)Bash(,|$)/);
    expect(tools).not.toMatch(/git push|git commit|gh |curl|WebFetch/);
  });

  it('checks the draft again after Claude and never opens one that fails verify', () => {
    expect(draft).toContain('pnpm guides:verify "$slug"');
    expect(draft.indexOf('pnpm guides:verify "$slug"')).toBeLessThan(draft.indexOf('gh pr create'));
    expect(draft).toContain("grep -Eq '^draft: true");
  });

  it('opens a draft PR with the guide-draft and content labels, committing only content/guides', () => {
    expect(draft).toContain('gh pr create');
    expect(draft).toContain('--draft');
    expect(draft).toContain('--label guide-draft --label content');
    expect(draft).toContain('git add content/guides');
  });

  it('reads the prompt from .github/prompts/draft-guide.md', () => {
    expect(draft).toContain('.github/prompts/draft-guide.md');
    expect(read('.github/prompts/draft-guide.md')).toContain(
      'Describe only what `guide.ts` actually does',
    );
  });
});

describe('guides-freshness.yml (JEF-533)', () => {
  it('runs every Monday at 06:00 UTC and by hand', () => {
    expect(freshness).toContain("- cron: '0 6 * * 1'");
    expect(freshness).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('uses no Claude', () => {
    expect(freshness).not.toContain('claude-code-action');
    expect(freshness).not.toContain('ANTHROPIC_API_KEY');
  });

  it('opens one screenshot PR on chore/guide-screenshots, only when an image changed', () => {
    expect(freshness).toContain('branch=chore/guide-screenshots');
    expect(freshness).toContain('git status --porcelain -- content/guides');
    expect(freshness).toContain('--state open --json number');
  });

  it('opens one guide-outdated issue per broken guide, with no duplicate', () => {
    expect(freshness).toContain('--label guide-outdated');
    expect(freshness).toContain('--state open');
    expect(freshness).toContain('An issue is already open for $slug');
    expect(freshness.indexOf('select(.title ==')).toBeLessThan(
      freshness.indexOf('gh issue create'),
    );
  });
});
