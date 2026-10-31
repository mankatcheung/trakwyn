import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The base images CI builds on are mirrored into our own Artifact Registry
 * from `infra/base-images.txt` (JEF-406). Four files have to agree about that
 * list, and none of them fails loudly on its own when they drift:
 *
 * - the pin file, which the mirror script and Renovate both read;
 * - `renovate.json`, whose regex silently skips a line it cannot match, so an
 *   image would stop being bumped without anyone noticing;
 * - `apps/api/Dockerfile`, whose Node major is what the mirror must carry;
 * - the mirror workflow, which may only run on main, where the deployer account
 *   that can write the mirror is reachable;
 * - `ci.yml`, which must pull base images from the mirror (JEF-407) and never
 *   from a public registry, and the Workload Identity bindings that decide who
 *   may log in to do that.
 */

const REPO = join(process.cwd(), '..', '..');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

const pinLines = (): string[] =>
  read('infra/base-images.txt')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);

/** The regex Renovate uses, read from renovate.json so the two cannot differ. */
const renovateRegex = (): RegExp => {
  const config = JSON.parse(read('renovate.json')) as {
    customManagers: { matchStrings: string[] }[];
  };
  return new RegExp(config.customManagers[0].matchStrings[0]);
};

describe('base image pins', () => {
  it('has at least one pin', () => {
    expect(pinLines().length).toBeGreaterThan(0);
  });

  it('pins every image by tag and a full sha256 digest', () => {
    for (const line of pinLines()) {
      expect(line, line).toMatch(/^[^@\s]+:[^@:/\s]+@sha256:[a-f0-9]{64}$/);
    }
  });

  it('is readable by the Renovate regex on every line, with its three groups', () => {
    const regex = renovateRegex();
    for (const line of pinLines()) {
      const groups = regex.exec(line)?.groups;
      expect(groups?.depName, line).toBeTruthy();
      expect(groups?.currentValue, line).toBeTruthy();
      expect(groups?.currentDigest, line).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('mirrors under a distinct name per image', () => {
    const names = pinLines().map((line) => line.split('@')[0].split('/').pop());
    expect(new Set(names).size).toBe(names.length);
  });

  it('carries the Node major the API Dockerfile builds on', () => {
    const major = /^ARG NODE_VERSION=(\d+)$/m.exec(read('apps/api/Dockerfile'))?.[1];
    expect(major).toBeTruthy();
    const node = pinLines().find((line) => /\/node:/.test(line));
    expect(node, 'no node pin').toBeTruthy();
    expect(node).toContain(`/node:${major}-`);
  });
});

describe('mirror script', () => {
  const script = join(REPO, '.github/scripts/mirror-base-images.sh');
  const list = (pinFile: string) =>
    execFileSync(script, ['--list', pinFile, 'europe-west1-docker.pkg.dev/p/base-images/'], {
      encoding: 'utf8',
    });

  it('maps each pin to <repo>/<last path segment>:<tag>, keeping the digest', () => {
    const rows = list(join(REPO, 'infra/base-images.txt')).trim().split('\n');
    expect(rows).toHaveLength(pinLines().length);
    for (const row of rows) {
      const [source, digest, destination] = row.split(' ');
      const name = source.split('/').pop();
      expect(destination).toBe(`europe-west1-docker.pkg.dev/p/base-images/${name}`);
      expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('refuses a pin it cannot read rather than skipping it', () => {
    const bad = join(process.env.TMPDIR ?? '/tmp', `bad-pins-${process.pid}.txt`);
    execFileSync('sh', ['-c', `printf 'node:24@sha256:abc\\n' > "${bad}"`]);
    try {
      expect(() => list(bad)).toThrow();
    } finally {
      rmSync(bad, { force: true });
    }
  });
});

describe('mirror script copying', () => {
  const script = join(REPO, '.github/scripts/mirror-base-images.sh');
  const DIGEST = `sha256:${'a'.repeat(64)}`;

  /**
   * Runs the script with a stand-in `docker` first on PATH. It fails the
   * first `failures` copies with a 429, then succeeds, and reports `reported`
   * as the copied digest.
   */
  const run = (failures: number, reported: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'mirror-'));
    try {
      writeFileSync(join(dir, 'pins.txt'), `example.com/library/img:1@${DIGEST}\n`);
      writeFileSync(join(dir, 'count'), '0');
      writeFileSync(
        join(dir, 'docker'),
        [
          '#!/usr/bin/env bash',
          'case "$3" in',
          '  create)',
          `    n=$(($(cat "${dir}/count") + 1)); echo $n > "${dir}/count"`,
          `    if (( n <= ${failures} )); then echo "429 Too Many Requests" >&2; exit 1; fi ;;`,
          `  inspect) echo ${reported} ;;`,
          'esac',
        ].join('\n'),
      );
      chmodSync(join(dir, 'docker'), 0o755);
      let status = 0;
      try {
        execFileSync(script, [join(dir, 'pins.txt'), 'registry.test/base'], {
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MIRROR_RETRY_DELAY: '0' },
          stdio: 'pipe',
        });
      } catch (error) {
        status = (error as { status: number }).status;
      }
      return { status, copies: Number(readFileSync(join(dir, 'count'), 'utf8')) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('succeeds first time when the copy keeps the pinned digest', () => {
    expect(run(0, DIGEST)).toEqual({ status: 0, copies: 1 });
  });

  it('retries a copy that hits a rate limit, then succeeds', () => {
    expect(run(2, DIGEST)).toEqual({ status: 0, copies: 3 });
  });

  it('gives up after five attempts', () => {
    expect(run(99, DIGEST)).toEqual({ status: 1, copies: 5 });
  });

  it('fails when the copy has a different digest from the pin', () => {
    expect(run(0, `sha256:${'b'.repeat(64)}`).status).toBe(1);
  });
});

describe('mirror workflow', () => {
  const workflow = read('.github/workflows/mirror-base-images.yml');

  it('runs only on main, where the deployer account that writes the mirror is reachable', () => {
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  });

  it('is the one place that mirrors from the pin file', () => {
    expect(workflow).toContain('.github/scripts/mirror-base-images.sh infra/base-images.txt');
  });
});

describe('workload identity (JEF-407)', () => {
  const wif = read('infra/gcp/wif.tf');
  const iam = read('infra/gcp/iam.tf');

  /** One `resource "type" "name" { ... }` block, up to the next top-level `}`. */
  const block = (source: string, type: string, name: string): string => {
    const start = source.indexOf(`resource "${type}" "${name}"`);
    expect(start, `${type}.${name}`).toBeGreaterThanOrEqual(0);
    return source.slice(start, source.indexOf('\n}\n', start));
  };

  it('admits tokens from this repository on main and on pull requests only', () => {
    const condition = /attribute_condition = (.+)/.exec(wif)?.[1] ?? '';
    expect(condition).toContain('assertion.repository ==');
    expect(condition).toContain('assertion.ref == \\"refs/heads/main\\"');
    expect(condition).toContain('assertion.ref.startsWith(\\"refs/pull/\\")');
  });

  it('lets only main act as the deployer', () => {
    const binding = block(wif, 'google_service_account_iam_member', 'github_impersonates_deployer');
    expect(binding).toContain('attribute.ref/refs/heads/main');
    expect(binding).not.toContain('attribute.repository');
  });

  it('lets the repository act as the read-only CI reader', () => {
    const binding = block(
      wif,
      'google_service_account_iam_member',
      'github_impersonates_ci_reader',
    );
    expect(binding).toContain('github_ci_reader');
    expect(binding).toContain('attribute.repository');
  });

  it('gives the CI reader one role: reader on the base-images repo', () => {
    const grants = [
      ...(wif + iam).matchAll(/resource "[^"]+" "([^"]+)" \{[^}]*github_ci_reader\.member[^}]*\}/g),
    ];
    expect(grants.map((match) => match[1])).toEqual(['ci_reader_base_images']);
    const grant = block(
      iam,
      'google_artifact_registry_repository_iam_member',
      'ci_reader_base_images',
    );
    expect(grant).toContain('roles/artifactregistry.reader');
    expect(grant).toContain('google_artifact_registry_repository.base.');
  });
});

describe('ci.yml base images (JEF-407)', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = (name: string): string => {
    const start = ci.indexOf(`\n  ${name}:`);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const next = ci.slice(start + 1).search(/\n {2}[a-z0-9-]+:\n/);
    return ci.slice(start, next < 0 ? undefined : start + 1 + next);
  };

  it('pulls from no public registry', () => {
    expect(ci).not.toMatch(/public\.ecr\.aws|docker\.io|mirror\.gcr\.io/);
    expect(job('e2e')).not.toMatch(/^ {4}services:/m);
  });

  it('builds the API image on the mirrored node image, in the PR check and the deploy', () => {
    expect(job('api-image')).toContain('NODE_IMAGE=${{ env.NODE_IMAGE }}');
    expect(job('deploy-api')).toContain('NODE_IMAGE=${{ env.NODE_IMAGE }}');
  });

  it('logs in as the read-only reader on pull requests and never as the deployer', () => {
    expect(job('api-image')).toContain('vars.GCP_CI_READER_SA');
    expect(job('api-image')).not.toContain('GCP_DEPLOYER_SA');
    expect(job('e2e')).toContain('vars.GCP_CI_READER_SA');
    expect(job('e2e')).not.toContain('GCP_DEPLOYER_SA');
    expect(job('e2e')).toContain('"$POSTGRES_IMAGE"');
  });

  it('keeps the Dockerfile default free of login', () => {
    expect(read('apps/api/Dockerfile')).toMatch(
      /^ARG NODE_IMAGE=mirror\.gcr\.io\/library\/node:\$\{NODE_VERSION\}-slim$/m,
    );
  });
});

describe('base image cache (JEF-474)', () => {
  const action = read('.github/actions/base-images/action.yml');
  const ci = read('.github/workflows/ci.yml');

  it('keys the preloaded tarball on the pin file, so a bump pulls and nothing else does', () => {
    expect(action).toMatch(/key: .*hashFiles\('infra\/base-images\.txt'\)/);
  });

  it('skips the registry login when the cache hit covers a preloading job', () => {
    expect(action).toContain("steps.cache.outputs.cache-hit != 'true'");
    expect(action).toMatch(
      /id: auth\n\s+if: inputs\.login == 'true' && \(inputs\.preload == '' && inputs\.oci == ''/,
    );
  });

  it('puts both lists in the cache key, so changing what a job asks for cannot reuse a stale entry', () => {
    expect(action).toMatch(/key: .*inputs\.preload.*inputs\.oci.*hashFiles/);
  });

  it('hands buildx the node image as an OCI layout named like the Dockerfile FROM, not as a pull', () => {
    expect(action).toContain('"${name^^}_IMAGE=$name-base"');
    expect(action).toContain('"${name^^}_BUILD_CONTEXT=$name-base=oci-layout://$layout:latest"');
    expect(action).toContain('skopeo copy');
    // skopeo rejects a reference carrying both tag and digest (PR #1157's first run).
    expect(action).toContain('ref="${repo%:*}@${ref#*@}"');
    expect(read('apps/api/Dockerfile').match(/^FROM \$\{NODE_IMAGE\}/gm)).toHaveLength(2);
  });

  it('runs the preloaded image under its local name, because a digest reference saves nameless', () => {
    expect(action).toContain('trakwyn-ci/$name:cached');
    expect(action).toContain('echo "${name^^}_IMAGE=$local_ref" >> "$GITHUB_ENV"');
  });

  it('preloads Postgres in e2e, the one job that runs a base image with docker run', () => {
    const start = ci.indexOf('\n  e2e:');
    const e2e = ci.slice(start, ci.indexOf('\n  deploy-api:', start));
    expect(e2e).toMatch(/preload: postgres/);
  });

  const job = (name: string): string => {
    const start = ci.indexOf(`\n  ${name}:`);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const next = ci.slice(start + 1).search(/\n {2}[a-z0-9-]+:\n/);
    return ci.slice(start, next < 0 ? undefined : start + 1 + next);
  };

  it.each(['api-image', 'deploy-api'])('%s builds on the cached node layout', (name) => {
    expect(job(name)).toMatch(/oci: node/);
    expect(job(name)).toContain('build-contexts: ${{ env.NODE_BUILD_CONTEXT }}');
  });

  it('deploy-api keeps its own login, which it needs to push, and the action does not repeat it', () => {
    const deploy = job('deploy-api');
    expect(deploy).toContain('docker/login-action');
    expect(deploy).toContain("login: 'false'");
    expect(deploy).toContain('vars.GCP_DEPLOYER_SA');
  });
});

describe('base-image-ref script', () => {
  const ref = (name: string) =>
    execFileSync(
      join(REPO, '.github/scripts/base-image-ref.sh'),
      [name, 'europe-west1-docker.pkg.dev/p/base-images'],
      { encoding: 'utf8' },
    ).trim();

  it('resolves each pin to <repo>/<name>:<tag>@<digest>', () => {
    for (const line of pinLines()) {
      const [source, digest] = line.split('@');
      const name = source.split('/').pop()?.split(':')[0] ?? '';
      const tag = source.split(':').pop();
      expect(ref(name)).toBe(`europe-west1-docker.pkg.dev/p/base-images/${name}:${tag}@${digest}`);
    }
  });

  it('refuses a name that is not pinned', () => {
    expect(() => ref('redis')).toThrow();
  });
});
