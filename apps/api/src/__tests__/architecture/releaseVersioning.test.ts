import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Five packages are versioned (JEF-389): the Clipper, the mobile app, the CLI,
 * and `apps/api` and `apps/web`, which release-please's linked-versions plugin
 * keeps on one shared `server` version. release-please bumps each one from the
 * squash-commit titles on main and records the result in
 * `.release-please-manifest.json`.
 *
 * The server pair uses the `simple` release type, which writes `version.txt`
 * and `CHANGELOG.md` instead of `package.json`. ci.yml deploys on
 * `apps/api/**` and `apps/web/**`, so it negates exactly those two files; a
 * release PR then never deploys. The commit SHA still names what is live; the
 * server version labels changelogs and gives self-hosters something to pin.
 * `packages/ui` stays unversioned.
 *
 * This lives with the other repo rules because the config is repo-wide and
 * has no package of its own to be tested in.
 */

const REPO_ROOT = join(process.cwd(), '..', '..');

const SERVER_PACKAGES = ['apps/api', 'apps/web'];
const VERSIONED_PACKAGES = ['apps/api', 'apps/cli', 'apps/extension', 'apps/mobile', 'apps/web'];

/** The file a package's version is read from; the server pair has no package.json version. */
function versionFile(path: string): string {
  return SERVER_PACKAGES.includes(path) ? 'version.txt' : 'package.json';
}

function readVersion(path: string): string {
  const file = versionFile(path);
  return file === 'version.txt'
    ? readFileSync(join(REPO_ROOT, path, file), 'utf8').trim()
    : readJson<{ version: string }>(join(path, file)).version;
}

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

/** Whether a push touching `file` runs ci.yml: the last matching pattern wins, as on GitHub. */
function triggersDeploy(file: string, patterns: string[]): boolean {
  return patterns.reduce((triggered, pattern) => {
    const negated = pattern.startsWith('!');
    const glob = negated ? pattern.slice(1) : pattern;
    const matches = file === glob || file.startsWith(glob.replace(/\*\*$/, ''));
    return matches ? !negated : triggered;
  }, false);
}

describe('release versioning', () => {
  const manifest = readJson<Record<string, string>>('.release-please-manifest.json');
  const config = readJson<{
    'group-pull-request-title-pattern'?: string;
    plugins?: { type: string; groupName?: string; components?: string[] }[];
    packages: Record<string, { component?: string; 'release-type'?: string }>;
  }>('release-please-config.json');

  it('versions exactly the installed artefacts and the server stack', () => {
    expect(Object.keys(config.packages).sort()).toEqual(VERSIONED_PACKAGES);
    expect(Object.keys(manifest).sort()).toEqual(VERSIONED_PACKAGES);
  });

  it.each(VERSIONED_PACKAGES)('keeps the manifest in step with %s', (path) => {
    const version = readVersion(path);

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest[path]).toBe(version);
  });

  it('links apps/api and apps/web into one server version', () => {
    const linked = config.plugins?.find((plugin) => plugin.type === 'linked-versions');
    const components = SERVER_PACKAGES.map((path) => config.packages[path].component);

    expect(linked?.groupName).toBe('server');
    expect([...(linked?.components ?? [])].sort()).toEqual([...components].sort());
    expect(manifest['apps/api']).toBe(manifest['apps/web']);
  });

  it('parses the title the linked-versions plugin gives the server release PR', () => {
    // The plugin hardcodes `chore${scope}: release <group> libraries`. release-please
    // reads a merged PR's title back with this pattern; a miss means "Bad pull request
    // title": no api/web tag or release, and every other release PR stops updating.
    const linked = config.plugins?.find((plugin) => plugin.type === 'linked-versions');

    expect(config['group-pull-request-title-pattern']).toBe(
      `chore\${scope}: release ${linked?.groupName} libraries`,
    );
  });

  it('releases the server pair as `simple`, so a release PR never edits its package.json', () => {
    for (const path of SERVER_PACKAGES) {
      expect(config.packages[path]['release-type']).toBe('simple');
    }
  });

  it('does not deploy the API or web when a release PR merges', () => {
    const pushPaths = ciPushPaths();
    const releaseTouched = [
      ...VERSIONED_PACKAGES.flatMap((path) => [
        join(path, versionFile(path)),
        join(path, 'CHANGELOG.md'),
      ]),
      ...RELEASE_FILES,
    ];

    expect(releaseTouched.filter((file) => triggersDeploy(file, pushPaths))).toEqual([]);
  });

  it('still deploys when the server code changes', () => {
    const pushPaths = ciPushPaths();

    expect(triggersDeploy('apps/api/src/index.ts', pushPaths)).toBe(true);
    expect(triggersDeploy('apps/web/package.json', pushPaths)).toBe(true);
  });

  describe('release.yml Clipper store job (JEF-419)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const job = workflow.slice(workflow.indexOf('  clipper-store:'));

    it('runs only when release-please reports a Clipper release', () => {
      expect(job).toContain('needs: release-please');
      expect(job).toContain("if: needs.release-please.outputs.clipper_released == 'true'");
      expect(workflow).toContain("outputs['apps/extension--release_created']");
    });

    it('builds from the tag with the PostHog key and the API URL from repository variables', () => {
      expect(job).toContain('ref: ${{ env.TAG }}');
      expect(job).toContain('vars.CLIPPER_POSTHOG_KEY');
      expect(job).toContain('VITE_API_URL: ${{ vars.CLIPPER_API_URL }}');
    });

    it('checks the manifest before uploading', () => {
      expect(job.indexOf('host_permissions')).toBeGreaterThan(-1);
      expect(job.indexOf('host_permissions')).toBeLessThan(job.indexOf('wxt submit'));
    });

    // JEF-429: with no person looking at the package before it goes to review,
    // a grown permission list or content-script host (which disables the
    // extension until every user re-approves it) has to stop the job instead.
    it('submits for review only after checking nothing was added since the previous release', () => {
      expect(job).not.toContain('--chrome-skip-submit-review');
      const guard = job.indexOf('Check nothing was added since the previous release');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(job.indexOf('wxt submit'));
      expect(job).toContain('.permissions');
      expect(job).toContain('.content_scripts[]?.matches[]?');
    });

    it('authenticates to the Web Store API v2 with a service account, not a refresh token', () => {
      expect(job).toContain('--chrome-api-version v2');
      expect(job).toContain('secrets.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY');
      expect(job).not.toContain('CHROME_REFRESH_TOKEN');
    });
  });
});
