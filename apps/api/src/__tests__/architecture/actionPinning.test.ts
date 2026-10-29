import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every third-party action is pinned to a commit SHA (JEF-477). A tag can be
 * moved, and deploy-api and deploy-web run actions with the GCP and Vercel
 * credentials. Renovate (`helpers:pinGitHubActionDigests`) keeps the SHAs and
 * their trailing `# vX` comments current. Like the other workflow tests this
 * reads the text, since the repo has no YAML parser.
 */

const REPO = join(process.cwd(), '..', '..');

/** `uses:` values that may stay unpinned, with the reason. */
const UNPINNED_ALLOWED: Record<string, string> = {};

function workflowFiles(): string[] {
  const workflows = readdirSync(join(REPO, '.github/workflows'))
    .filter((f) => f.endsWith('.yml'))
    .map((f) => `.github/workflows/${f}`);
  const actions = readdirSync(join(REPO, '.github/actions')).map(
    (dir) => `.github/actions/${dir}/action.yml`,
  );
  return [...workflows, ...actions];
}

/** Every `uses:` value in a file, with its line number and trailing comment. */
function usesIn(text: string): { line: number; ref: string; comment: string }[] {
  const out: { line: number; ref: string; comment: string }[] = [];
  text.split('\n').forEach((line, i) => {
    const match = /^\s*(?:-\s+)?uses:\s*(\S+)\s*(?:#\s*(.*))?$/.exec(line);
    if (match) out.push({ line: i + 1, ref: match[1], comment: match[2] ?? '' });
  });
  return out;
}

describe('workflow action pinning', () => {
  it('finds the workflows and composite actions it is meant to check', () => {
    const files = workflowFiles();
    expect(files).toContain('.github/workflows/ci.yml');
    expect(files).toContain('.github/workflows/codeql.yml');
    expect(files).toContain('.github/actions/setup-project/action.yml');
  });

  it('pins every non-local action to a 40-character commit SHA with the tag in a comment', () => {
    const problems: string[] = [];
    for (const file of workflowFiles()) {
      for (const { line, ref, comment } of usesIn(readFileSync(join(REPO, file), 'utf8'))) {
        if (ref.startsWith('./') || ref in UNPINNED_ALLOWED) continue;
        if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref)) {
          problems.push(`${file}:${line} ${ref} is not pinned to a commit SHA`);
        } else if (!/^v?\d/.test(comment)) {
          problems.push(`${file}:${line} ${ref} has no version comment`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('recognises a tag-pinned action as unpinned', () => {
    const [found] = usesIn('      - uses: actions/checkout@v4\n');
    expect(found.ref).toBe('actions/checkout@v4');
    expect(/@[0-9a-f]{40}$/.test(found.ref)).toBe(false);
  });
});

describe('security checks in CI', () => {
  const ci = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

  it('requires dependency review and the secret scan through ci-ok', () => {
    const needs = /^ {4}needs: \[([^\]]*)\]/m.exec(ci.slice(ci.indexOf('\n  ci-ok:')));
    expect(needs?.[1].split(',').map((n) => n.trim())).toEqual(
      expect.arrayContaining(['dependency-review', 'secret-scan']),
    );
  });

  it('runs CodeQL on main, on pull requests and weekly', () => {
    const codeql = readFileSync(join(REPO, '.github/workflows/codeql.yml'), 'utf8');
    expect(codeql).toMatch(/^ {2}push:\n {4}branches: \[main\]/m);
    expect(codeql).toMatch(/^ {2}pull_request:/m);
    expect(codeql).toMatch(/^ {2}schedule:\n(?: {4}#.*\n)* {4}- cron:/m);
    expect(codeql).toContain('security-events: write');
  });

  it('lets Renovate pin and update actions', () => {
    const renovate = JSON.parse(readFileSync(join(REPO, 'renovate.json'), 'utf8'));
    expect(renovate.extends).toContain('helpers:pinGitHubActionDigests');
    expect(renovate.enabledManagers).toContain('github-actions');
  });
});
