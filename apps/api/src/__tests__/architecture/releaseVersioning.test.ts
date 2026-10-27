import { execFileSync } from 'node:child_process';
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
/**
 * One job of a workflow: from its `  <name>:` line up to the next job at the
 * same indent, so a job added after it is not read as part of it.
 */
function jobBlock(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`release.yml has no ${name} job`);
  const next = workflow.slice(start + 1).search(/\n  [a-z][\w-]*:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

/**
 * When a Clipper store job runs: after release-please released the Clipper, or
 * on a manual run that names an existing tag (JEF-454). `!cancelled()` because
 * release-please is skipped on a manual run, which would otherwise skip these.
 */
const CLIPPER_JOB_IF =
  "if: ${{ !cancelled() && (needs.release-please.outputs.clipper_released == 'true' || github.event_name == 'workflow_dispatch') }}";
const CLIPPER_JOB_TAG =
  'TAG: ${{ inputs.clipper_tag || needs.release-please.outputs.clipper_tag }}';
const CLIPPER_TAG_PATTERN = '^clipper-v[0-9]+\\.[0-9]+\\.[0-9]+$';

function hasJq(): boolean {
  try {
    execFileSync('jq', ['--version']);
    return true;
  } catch {
    return false;
  }
}

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
    const job = jobBlock(workflow, 'clipper-store');

    it('runs only when release-please reports a Clipper release, or for a tag named by hand', () => {
      expect(job).toContain('needs: release-please');
      expect(job).toContain(CLIPPER_JOB_IF);
      expect(job).toContain(CLIPPER_JOB_TAG);
      expect(job).toContain(CLIPPER_TAG_PATTERN);
      expect(workflow).toContain("outputs['apps/extension--release_created']");
    });

    // JEF-454: the guard's jq program did not compile on the runner's jq 1.7
    // (an unparenthesised `a - b` object value, which jq 1.8 accepts), so it
    // failed every release. Run the program itself rather than read its text.
    it.skipIf(!hasJq())('runs a guard program that compiles and reports what was added', () => {
      const program = job.match(
        /added=\$\(jq -n --argjson old "\$old" --argjson new "\$new" '([\s\S]*?)'\)/,
      )?.[1];
      expect(program).toBeDefined();
      const manifest = (permissions: string[], matches: string[]) =>
        JSON.stringify({ permissions, content_scripts: [{ matches }] });
      const run = (oldManifest: string, newManifest: string) =>
        JSON.parse(
          execFileSync(
            'jq',
            [
              '-c',
              '-n',
              '--argjson',
              'old',
              oldManifest,
              '--argjson',
              'new',
              newManifest,
              program!,
            ],
            {
              encoding: 'utf8',
            },
          ),
        );
      const previous = manifest(['storage'], ['https://a.example/*']);

      expect(run(previous, previous)).toEqual({});
      expect(
        run(
          previous,
          manifest(['storage', 'tabs'], ['https://a.example/*', 'https://b.example/*']),
        ),
      ).toEqual({
        permissions: ['tabs'],
        content_script_matches: ['https://b.example/*'],
      });
    });

    it('parenthesises each object value in the guard, so jq 1.7 can parse it', () => {
      // A local jq 1.8 parses the unparenthesised form, so the test above alone
      // would pass on a laptop and still fail on the runner.
      expect(job).toContain('content_script_matches: (($new | hosts) - ($old | hosts))');
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
      // Approval publishes the release; say so rather than lean on the default.
      expect(job).toContain('--chrome-publish-type DEFAULT_PUBLISH');
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

  describe('Clipper on Firefox Add-ons (JEF-437)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const amoWorkflow = readFileSync(join(REPO_ROOT, '.github/workflows/clipper-amo.yml'), 'utf8');
    const build = jobBlock(workflow, 'clipper-firefox-zip');
    const submit = jobBlock(amoWorkflow, 'clipper-amo');

    it('builds the Firefox zips only for a Clipper release or a tag named by hand, from the tag', () => {
      expect(build).toContain('needs: release-please');
      expect(build).toContain(CLIPPER_JOB_IF);
      expect(build).toContain(CLIPPER_JOB_TAG);
      expect(build).toContain(CLIPPER_TAG_PATTERN);
      expect(build).toContain('ref: ${{ env.TAG }}');
      expect(build).toContain('vars.CLIPPER_POSTHOG_KEY');
      expect(build).toContain('VITE_API_URL: ${{ vars.CLIPPER_API_URL }}');
      expect(build).toContain('rm -f apps/extension/.env');
      expect(build).toContain('zip:firefox');
    });

    // JEF-454: the build refuses to run without VITE_WEB_URL (JEF-428), and
    // this job did not pass it, so 1.2.0's Firefox build failed.
    it('builds with the web app URL and checks the bundle links to it, as the Chrome job does', () => {
      expect(build).toContain('VITE_WEB_URL: ${{ vars.CLIPPER_WEB_URL }}');
      expect(build).toContain('Repository variable CLIPPER_WEB_URL is not set');
      const bundleCheck = build.indexOf('grep -qF "${{ vars.CLIPPER_WEB_URL }}"');
      expect(bundleCheck).toBeGreaterThan(-1);
      expect(bundleCheck).toBeLessThan(build.indexOf('gh release upload'));
    });

    it('checks the Firefox manifest before the zips leave the job', () => {
      for (const check of ['host_permissions', 'has("key")', '"tabs"', 'clipper@trakwyn.com']) {
        expect(build).toContain(check);
        expect(build.indexOf(check)).toBeLessThan(build.indexOf('gh release upload'));
      }
      expect(build).toContain('*-sources.zip');
    });

    it('hands the submission to its own workflow, so waiting for approval holds up no other release', () => {
      // release.yml runs under one concurrency group: a job waiting there for a
      // reviewer would hold every later release until someone approved it.
      expect(build).toContain('gh workflow run clipper-amo.yml');
      expect(build).toContain('actions: write');
      expect(workflow).not.toContain('environment: amo');
      expect(build).not.toContain('wxt submit');
      expect(build).not.toContain('FIREFOX_JWT');
    });

    it('submits to AMO only after a person approves it in the amo environment', () => {
      // AMO has no draft or deferred publishing: an approved listed version
      // goes live, so the environment's required reviewer is the only gate.
      expect(amoWorkflow).toContain('workflow_dispatch:');
      expect(submit).toContain('environment: amo');
      expect(submit).toContain('^clipper-v[0-9]+\\.[0-9]+\\.[0-9]+$');
      expect(submit).toContain('ref: ${{ env.TAG }}');
      expect(submit.indexOf('environment: amo')).toBeLessThan(submit.indexOf('wxt submit'));
    });

    it('submits a listed, desktop-only version with its sources', () => {
      expect(submit).toContain('--firefox-channel listed');
      expect(submit).toContain('--firefox-compatibility firefox');
      expect(submit).toContain('--firefox-sources-zip');
      expect(submit).toContain('--firefox-extension-id clipper@trakwyn.com');
      expect(submit).toContain('secrets.FIREFOX_JWT_SECRET');
    });
  });

  // JEF-454: re-running a failed job uses the workflow file of the commit it
  // ran on, so a fix to a store job could not release a tag that already
  // exists. A manual run with that tag runs only the store jobs.
  describe('release.yml manual run for an existing Clipper tag (JEF-454)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');

    it('takes a Clipper tag as input', () => {
      expect(workflow).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+clipper_tag:/);
    });

    it('does not run release-please on a manual run', () => {
      expect(jobBlock(workflow, 'release-please')).toContain("if: github.event_name == 'push'");
    });
  });
});
