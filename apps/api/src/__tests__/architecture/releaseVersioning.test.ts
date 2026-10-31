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

/**
 * The checks both Clipper store jobs share (JEF-479): the tag, the manifest,
 * the bundle's URLs and the nothing-added-since-the-previous-release guard.
 */
const GUARD_ACTION = readFileSync(
  join(REPO_ROOT, '.github/actions/clipper-release-guard/action.yml'),
  'utf8',
);
const GUARD_USES = 'uses: ./.github/actions/clipper-release-guard';

function hasJq(): boolean {
  try {
    execFileSync('jq', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * The jq program of a job's "Check nothing was added since the previous
 * release" step, run on two manifests the way the step runs it (JEF-454).
 */
function runAddedSinceGuard(job: string, oldManifest: object, newManifest: object): unknown {
  const program = job.match(
    /added=\$\(jq -n --argjson old "\$old" --argjson new "\$new" '([\s\S]*?)'\)/,
  )?.[1];
  if (program === undefined) throw new Error('job has no added-since-previous-release guard');
  const args = ['-c', '-n', '--argjson', 'old', JSON.stringify(oldManifest)];
  args.push('--argjson', 'new', JSON.stringify(newManifest), program);
  return JSON.parse(execFileSync('jq', args, { encoding: 'utf8' }));
}

const guardManifest = (permissions: string[], matches: string[]) => ({
  permissions,
  content_scripts: [{ matches }],
});

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

  describe('release.yml Clipper Chrome zip job (JEF-419, JEF-480)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const job = jobBlock(workflow, 'clipper-chrome-zip');

    it('runs only when release-please reports a Clipper release, or for a tag named by hand', () => {
      expect(job).toContain('needs: release-please');
      expect(job).toContain(CLIPPER_JOB_IF);
      expect(job).toContain(CLIPPER_JOB_TAG);
      expect(GUARD_ACTION).toContain(CLIPPER_TAG_PATTERN);
      expect(workflow).toContain("outputs['apps/extension--release_created']");
    });

    // JEF-454: the guard's jq program did not compile on the runner's jq 1.7
    // (an unparenthesised `a - b` object value, which jq 1.8 accepts), so it
    // failed every release. Run the program itself rather than read its text.
    it.skipIf(!hasJq())('runs a guard program that compiles and reports what was added', () => {
      const previous = guardManifest(['storage'], ['https://a.example/*']);

      expect(runAddedSinceGuard(GUARD_ACTION, previous, previous)).toEqual({});
      expect(
        runAddedSinceGuard(
          GUARD_ACTION,
          previous,
          guardManifest(['storage', 'tabs'], ['https://a.example/*', 'https://b.example/*']),
        ),
      ).toEqual({
        permissions: ['tabs'],
        content_script_matches: ['https://b.example/*'],
      });
    });

    it('parenthesises each object value in the guard, so jq 1.7 can parse it', () => {
      // A local jq 1.8 parses the unparenthesised form, so the test above alone
      // would pass on a laptop and still fail on the runner.
      expect(GUARD_ACTION).toContain('content_script_matches: (($new | hosts) - ($old | hosts))');
    });

    it('builds from the tag with the PostHog key and the API URL from repository variables', () => {
      expect(job).toContain('ref: ${{ env.TAG }}');
      expect(job).toContain('vars.CLIPPER_POSTHOG_KEY');
      expect(job).toContain('VITE_API_URL: ${{ vars.CLIPPER_API_URL }}');
    });

    // JEF-479: the checks are one action both stores use, so a fix to one
    // cannot be missed in the other.
    it('checks the manifest, with the shared guard, before the zip leaves the job', () => {
      expect(GUARD_ACTION).toContain('host_permissions');
      expect(job).toContain(GUARD_USES);
      expect(job).toContain("zip-glob: '*-chrome.zip'");
      expect(job.indexOf(GUARD_USES)).toBeLessThan(job.indexOf('gh release upload'));
    });

    // JEF-429: with no person looking at the package before it goes to review,
    // a grown permission list or content-script host (which disables the
    // extension until every user re-approves it) has to stop the job instead.
    it('hands the zip on only after checking nothing was added since the previous release', () => {
      expect(GUARD_ACTION).toContain('Check nothing was added since the previous release');
      expect(GUARD_ACTION).toContain('.permissions');
      expect(GUARD_ACTION).toContain('.content_scripts[]?.matches[]?');
      expect(job.indexOf(GUARD_USES)).toBeGreaterThan(-1);
      expect(job.indexOf(GUARD_USES)).toBeLessThan(job.indexOf('gh release upload'));
      expect(job.indexOf(GUARD_USES)).toBeLessThan(job.indexOf('gh workflow run clipper-cws.yml'));
    });

    it('hands the submission to its own workflow, which can be run again by hand for a tag', () => {
      expect(job).toContain('gh workflow run clipper-cws.yml');
      expect(job).toContain('actions: write');
      expect(workflow).not.toContain('environment: chrome');
      expect(job).not.toContain('wxt submit');
      expect(job).not.toContain('CHROME_SERVICE_ACCOUNT');
    });
  });

  describe('Clipper on the Chrome Web Store (JEF-480)', () => {
    const cwsWorkflow = readFileSync(join(REPO_ROOT, '.github/workflows/clipper-cws.yml'), 'utf8');
    const submit = jobBlock(cwsWorkflow, 'clipper-cws');

    // The environment's secrets are readable only by a job that names it, and
    // only from the branches it allows. It has no required reviewer: the checks
    // in clipper-chrome-zip stand in for one.
    it('submits from the chrome environment, which keeps the Web Store secrets to that one job', () => {
      expect(cwsWorkflow).toContain('workflow_dispatch:');
      expect(submit).toContain('environment: chrome');
      expect(submit).toContain(CLIPPER_TAG_PATTERN);
      expect(submit).toContain('ref: ${{ env.TAG }}');
      expect(cwsWorkflow).not.toMatch(/approv/i);
    });

    it('submits the zip attached to the GitHub Release, not a rebuild', () => {
      expect(submit).toContain('gh release download "$TAG" --pattern \'*-chrome.zip\'');
      expect(submit).not.toContain('pnpm --filter @trakwyn/extension zip');
    });

    it('submits for review and publishes on approval, saying so rather than leaning on the default', () => {
      expect(submit).not.toContain('--chrome-skip-submit-review');
      expect(submit).toContain('--chrome-publish-type DEFAULT_PUBLISH');
    });

    it('authenticates to the Web Store API v2 with a service account, not a refresh token', () => {
      expect(submit).toContain('--chrome-api-version v2');
      expect(submit).toContain('secrets.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY');
      expect(submit).not.toContain('CHROME_REFRESH_TOKEN');
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
      expect(GUARD_ACTION).toContain(CLIPPER_TAG_PATTERN);
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
      expect(build).toContain('web-url: ${{ vars.CLIPPER_WEB_URL }}');
      expect(GUARD_ACTION).toContain('grep -qF "$WEB_URL"');
      expect(build.indexOf(GUARD_USES)).toBeLessThan(build.indexOf('gh release upload'));
    });

    it('checks the Firefox manifest before the zips leave the job', () => {
      expect(GUARD_ACTION).toContain('host_permissions');
      expect(build).toContain(GUARD_USES);
      expect(build).toContain("zip-glob: '*-firefox.zip'");
      for (const check of ['has("key")', '"tabs"', 'clipper@trakwyn.com']) {
        expect(build).toContain(check);
        expect(build.indexOf(check)).toBeLessThan(build.indexOf('gh release upload'));
      }
      expect(build).toContain('*-sources.zip');
    });

    // JEF-458: no person looks at a Firefox release before AMO's review either,
    // so, as on Chrome (JEF-429), a grown permission list or content-script host
    // (which holds the update until every user re-approves it) stops the job
    // before anything is attached or submitted.
    it('checks nothing was added since the previous Firefox release before the zips leave the job', () => {
      const guard = build.indexOf(GUARD_USES);
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(build.indexOf('gh release upload'));
      expect(guard).toBeLessThan(build.indexOf('gh workflow run clipper-amo.yml'));
      // Against the previous release's Firefox zip, not its Chrome one: the two
      // ask for different permissions. The action downloads the zip its
      // `zip-glob` input names.
      expect(build).toContain("zip-glob: '*-firefox.zip'");
      expect(GUARD_ACTION).toContain('--pattern "$ZIP_GLOB"');
      expect(GUARD_ACTION).toContain('has no $STORE zip to compare with');
    });

    it.skipIf(!hasJq())(
      'runs a Firefox guard program that compiles and reports what was added',
      () => {
        const previous = guardManifest(['storage', 'activeTab', 'tabs'], ['https://a.example/*']);

        expect(runAddedSinceGuard(GUARD_ACTION, previous, previous)).toEqual({});
        expect(
          runAddedSinceGuard(
            GUARD_ACTION,
            previous,
            guardManifest(
              ['storage', 'activeTab', 'tabs'],
              ['https://a.example/*', 'https://b.example/*'],
            ),
          ),
        ).toEqual({ content_script_matches: ['https://b.example/*'] });
      },
    );

    it('hands the submission to its own workflow, which can be run again by hand for a tag', () => {
      expect(build).toContain('gh workflow run clipper-amo.yml');
      expect(build).toContain('actions: write');
      expect(workflow).not.toContain('environment: amo');
      expect(build).not.toContain('wxt submit');
      expect(build).not.toContain('FIREFOX_JWT');
    });

    it('submits from the amo environment, which keeps the AMO secrets to that one job', () => {
      // The environment's secrets are readable only by a job that names it, and
      // only from the branches it allows. It has no required reviewer (JEF-458):
      // the checks in clipper-firefox-zip stand in for one.
      expect(amoWorkflow).toContain('workflow_dispatch:');
      expect(submit).toContain('environment: amo');
      expect(submit).toContain('^clipper-v[0-9]+\\.[0-9]+\\.[0-9]+$');
      expect(submit).toContain('ref: ${{ env.TAG }}');
      expect(amoWorkflow).not.toMatch(/approv/i);
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

  // JEF-479: GITHUB_TOKEN cannot start ci.yml on a release PR, so release.yml
  // posts the `ci-ok` status itself, for a PR that edits only release files.
  describe('ci-ok on release PRs (JEF-479)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const job = jobBlock(workflow, 'release-pr-ci');

    it('posts ci-ok for the PRs release-please created or updated', () => {
      expect(job).toContain("if: needs.release-please.outputs.prs_created == 'true'");
      expect(job).toContain('statuses: write');
      expect(job).toContain('context=ci-ok');
    });

    it('passes only a PR whose files are all ones release-please writes', () => {
      const allowed = /ALLOWED: '(.+)'/.exec(job)?.[1];
      if (!allowed) throw new Error('release-pr-ci has no ALLOWED pattern');
      const pattern = new RegExp(allowed);

      const releaseFiles = [
        ...VERSIONED_PACKAGES.flatMap((path) => [
          join(path, versionFile(path)),
          join(path, 'CHANGELOG.md'),
        ]),
        ...RELEASE_FILES.filter((file) => file.startsWith('.')),
      ];
      expect(releaseFiles.filter((file) => !pattern.test(file))).toEqual([]);
      expect(pattern.test('apps/api/src/index.ts')).toBe(false);
      expect(pattern.test('.github/workflows/ci.yml')).toBe(false);
      expect(pattern.test('apps/mobile/src/App.tsx')).toBe(false);
    });

    // The rule is only safe because none of those files deploys.
    it('allows only files that do not run ci.yml on a push', () => {
      const allowed = /ALLOWED: '(.+)'/.exec(job)?.[1] ?? '';
      expect(allowed).not.toBe('');
      const pushPaths = ciPushPaths();
      const deploying = VERSIONED_PACKAGES.flatMap((path) =>
        ['version.txt', 'CHANGELOG.md', 'package.json']
          .map((file) => join(path, file))
          .filter((file) => new RegExp(allowed).test(file) && triggersDeploy(file, pushPaths)),
      );
      expect(deploying).toEqual([]);
    });
  });

  // JEF-479: the deploy jobs hold production credentials, so they run in the
  // `production` environment: Deployments history, and a place to add an
  // approval later.
  describe('ci.yml production environment (JEF-479)', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');

    it.each(['migrate-db', 'deploy-api', 'deploy-web'])('runs %s in production', (name) => {
      expect(jobBlock(ci, name)).toContain('environment: production');
    });

    // Only the deploy jobs: a pull request job in an environment would read
    // its secrets, and notify-deploy must report a deploy that never reached it.
    it('keeps every other job out of it', () => {
      expect(ci.match(/^ {4}environment:/gm)).toHaveLength(3);
    });
  });
});
