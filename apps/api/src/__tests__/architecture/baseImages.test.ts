import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
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
 * - the mirror workflow, which may only run where Workload Identity Federation
 *   issues tokens (`infra/gcp/wif.tf`).
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

describe('mirror workflow', () => {
  const workflow = read('.github/workflows/mirror-base-images.yml');

  it('runs only on main, where Workload Identity Federation issues tokens', () => {
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(read('infra/gcp/wif.tf')).toContain('assertion.ref == \\"refs/heads/main\\"');
  });

  it('is the one place that mirrors from the pin file', () => {
    expect(workflow).toContain('.github/scripts/mirror-base-images.sh infra/base-images.txt');
  });
});
