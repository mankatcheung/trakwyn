import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The security checks wired into CI (JEF-477): dependency review and the
 * secret scan gate `ci-ok`, CodeQL runs on its own schedule, and Renovate keeps
 * the actions current. Like the other workflow tests this reads the text, since
 * the repo has no YAML parser.
 */

const REPO = join(process.cwd(), '..', '..');

describe('security checks in CI', () => {
  const ci = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');

  it('requires dependency review and the secret scan through ci-ok', () => {
    // Prettier wraps a long list onto several lines, so `\s*` spans the break.
    const needs = /^ {4}needs:\s*\[([^\]]*)\]/m.exec(ci.slice(ci.indexOf('\n  ci-ok:')));
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

  it('lets Renovate update actions', () => {
    const renovate = JSON.parse(readFileSync(join(REPO, 'renovate.json'), 'utf8'));
    expect(renovate.enabledManagers).toContain('github-actions');
  });
});
