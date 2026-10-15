import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Five things are versioned (JEF-389): the Clipper, the mobile app, the CLI
 * and the server stack, which is `apps/api` and `apps/web` together under the
 * repo root's package.json (component `server`). release-please bumps each
 * one's package.json from the squash-commit titles on main and records the
 * result in `.release-please-manifest.json`.
 *
 * The server version sits at the root, not in `apps/api` or `apps/web`,
 * because ci.yml deploys on `apps/api/**` and `apps/web/**`: a release PR that
 * edited either package.json would deploy on merge. The commit SHA still names
 * what is live; the server version is a label for self-hosters and changelogs.
 * `packages/ui` stays unversioned.
 *
 * This lives with the other repo rules because the config is repo-wide and
 * has no package of its own to be tested in.
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

const VERSIONED_PACKAGES = ['.', 'apps/cli', 'apps/extension', 'apps/mobile'];

/** Under the root package, so the release PR must leave them out of `server`. */
const EXCLUDED_FROM_SERVER = ['apps/cli', 'apps/extension', 'apps/mobile'];

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
  const config = readJson<{
    packages: Record<string, { component?: string; 'exclude-paths'?: string[] }>;
  }>('release-please-config.json');

  it('versions exactly the installed artefacts and the server stack', () => {
    expect(Object.keys(config.packages).sort()).toEqual(VERSIONED_PACKAGES);
    expect(Object.keys(manifest).sort()).toEqual(VERSIONED_PACKAGES);
  });

  it.each(VERSIONED_PACKAGES)('keeps the manifest in step with %s/package.json', (path) => {
    const { version } = readJson<{ version: string }>(join(path, 'package.json'));

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest[path]).toBe(version);
  });

  it('versions the server stack at the root and leaves the other packages out of it', () => {
    const server = config.packages['.'];

    expect(server.component).toBe('server');
    expect(server['exclude-paths']).toEqual(expect.arrayContaining(EXCLUDED_FROM_SERVER));
  });

  it('keeps apps/api and apps/web unversioned, so no release PR edits a deploy path', () => {
    for (const path of ['apps/api', 'apps/web']) {
      expect(config.packages).not.toHaveProperty(path);
      expect(manifest).not.toHaveProperty(path);
    }
  });

  it('does not deploy the API or web when a release PR merges', () => {
    const pushPaths = ciPushPaths();
    const releaseTouched = [
      ...VERSIONED_PACKAGES.flatMap((path) => [
        join(path, 'package.json'),
        join(path, 'CHANGELOG.md'),
      ]),
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
