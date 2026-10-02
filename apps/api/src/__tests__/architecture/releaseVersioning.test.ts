import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Only the artefacts someone installs are versioned (JEF-389): the Clipper,
 * the mobile app and the CLI. release-please bumps each one's package.json
 * from the squash-commit titles on main and records the result in
 * `.release-please-manifest.json`.
 *
 * `apps/api`, `apps/web` and `packages/ui` are left out on purpose. API and
 * web deploy on every merge, so exactly one version is live and the commit
 * SHA already names it (JEF-362); a semver there would identify nothing.
 *
 * This lives with the other repo rules because the config is repo-wide and
 * has no package of its own to be tested in.
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

const VERSIONED_PACKAGES = ['apps/cli', 'apps/extension', 'apps/mobile'];

const RELEASE_FILES = ['release-please-config.json', '.release-please-manifest.json'];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as T;
}

/** The `paths:` list under `on.push` in ci.yml, which decides what deploys. */
function ciPushPaths(): string[] {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  const block = /^ {2}push:\n(?: {4}.*\n)*? {4}paths:\n((?: {6}- .*\n)+)/m.exec(workflow);
  if (!block) throw new Error('ci.yml has no on.push.paths list');
  return block[1]
    .trim()
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').replace(/['"]/g, ''));
}

describe('release versioning', () => {
  const manifest = readJson<Record<string, string>>('.release-please-manifest.json');
  const config = readJson<{ packages: Record<string, unknown> }>('release-please-config.json');

  it('versions exactly the installed artefacts', () => {
    expect(Object.keys(config.packages).sort()).toEqual(VERSIONED_PACKAGES);
    expect(Object.keys(manifest).sort()).toEqual(VERSIONED_PACKAGES);
  });

  it.each(VERSIONED_PACKAGES)('keeps the manifest in step with %s/package.json', (path) => {
    const { version } = readJson<{ version: string }>(`${path}/package.json`);

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest[path]).toBe(version);
  });

  it('does not deploy the API or web when a release PR merges', () => {
    const pushPaths = ciPushPaths();
    const releaseTouched = [
      ...VERSIONED_PACKAGES.flatMap((path) => [`${path}/package.json`, `${path}/CHANGELOG.md`]),
      ...RELEASE_FILES,
    ];

    const triggering = releaseTouched.filter((file) =>
      pushPaths.some(
        (pattern) => file === pattern || file.startsWith(pattern.replace(/\*\*$/, '')),
      ),
    );

    expect(triggering).toEqual([]);
  });
});
