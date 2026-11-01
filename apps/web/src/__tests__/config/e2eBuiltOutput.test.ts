import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// JEF-487: CI e2e serves built output. `vite preview` cannot serve the Vercel
// nitro build, so the e2e job builds with E2E_PLAIN_BUILD=1 and vite.config.ts
// must honour it. If either side drops the flag, the job breaks at runtime.
const read = (...parts: string[]) =>
  readFileSync(resolve(__dirname, '../../../', ...parts), 'utf8');
const repoFile = (...parts: string[]) =>
  readFileSync(resolve(__dirname, '../../../../../', ...parts), 'utf8');

describe('e2e runs against built output in CI', () => {
  it('skips nitro in vite.config.ts when E2E_PLAIN_BUILD is set', () => {
    expect(read('vite.config.ts')).toMatch(/command === 'build' && !process\.env\.E2E_PLAIN_BUILD/);
  });

  it('builds with E2E_PLAIN_BUILD in the e2e job', () => {
    const ci = repoFile('.github/workflows/ci.yml');
    const e2eJob = ci.slice(ci.indexOf('\n  e2e:'), ci.indexOf('\n  dependency-review:'));
    expect(e2eJob).toContain('pnpm --filter @trakwyn/api build');
    expect(e2eJob).toContain('pnpm --filter @trakwyn/web build');
    expect(e2eJob).toContain("E2E_PLAIN_BUILD: '1'");
  });

  it('starts built servers in CI and dev servers locally', () => {
    const config = read('playwright.config.ts');
    expect(config).toContain("'pnpm --filter @trakwyn/api start'");
    expect(config).toContain("'pnpm --filter @trakwyn/web preview --port 3000 --strictPort'");
    expect(config).toContain("'pnpm --filter @trakwyn/api dev'");
    expect(config).toContain("'pnpm --filter @trakwyn/web dev'");
  });
});
