import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { e2eEnvFile, webServerEnv } from '../../../e2eEnv.ts';

// e2eEnv.ts reads the gitignored `.env.e2e` of the app a Playwright web server
// starts (JEF-656). Every case builds its own apps/{api,web} tree in a temp
// directory, so a developer's real `.env.e2e` cannot change the result.
let root: string;

function write(app: 'api' | 'web', content: string): void {
  mkdirSync(join(root, app), { recursive: true });
  writeFileSync(join(root, app, '.env.e2e'), content);
}

describe('e2eEnv', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'e2e-env-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('points at apps/api/.env.e2e and apps/web/.env.e2e beside this app', () => {
    expect(e2eEnvFile('api', '/repo/apps/web')).toBe('/repo/apps/api/.env.e2e');
    expect(e2eEnvFile('web', '/repo/apps/web')).toBe('/repo/apps/web/.env.e2e');
  });

  it('reads the app’s file, with quotes, comments and blank values handled', () => {
    write(
      'api',
      ['# a comment', 'JWT_SECRET="e2e-only-jwt-secret"', 'COOKIE_DOMAIN=', ''].join('\n'),
    );

    const env = webServerEnv('api', {}, join(root, 'web'));

    expect(env.JWT_SECRET).toBe('e2e-only-jwt-secret');
    expect(env.COOKIE_DOMAIN).toBe('');
    expect(Object.keys(env)).not.toContain('# a comment');
  });

  it('keeps each app to its own file', () => {
    write('api', 'PORT=3001\n');
    write('web', 'VITE_API_URL=/graphql\n');

    expect(webServerEnv('api', {}, join(root, 'web')).VITE_API_URL).toBeUndefined();
    expect(webServerEnv('web', {}, join(root, 'web')).PORT).toBeUndefined();
  });

  it('lets a variable already in the shell win over the file, as dotenv does', () => {
    write('api', 'PLANS_ENFORCED=false\nPORT=3001\n');

    const env = webServerEnv('api', { PLANS_ENFORCED: 'true' }, join(root, 'web'));

    expect(env.PLANS_ENFORCED).toBe('true');
    expect(env.PORT).toBe('3001');
  });

  it('passes the shell environment through, so the server still finds PATH and the rest', () => {
    write('web', 'VITE_API_URL=/graphql\n');

    const env = webServerEnv('web', { PATH: '/usr/bin', HOME: '/home/dev' }, join(root, 'web'));

    expect(env).toMatchObject({ PATH: '/usr/bin', HOME: '/home/dev', VITE_API_URL: '/graphql' });
  });

  it('drops shell variables with no value, which a child process cannot be given', () => {
    const env = webServerEnv('api', { SET: 'yes', UNSET: undefined }, join(root, 'web'));

    expect(env.SET).toBe('yes');
    expect(Object.keys(env)).not.toContain('UNSET');
  });

  it('is just the shell environment when there is no .env.e2e, as in CI', () => {
    const env = webServerEnv(
      'api',
      { CI: 'true', DATABASE_URL: 'postgres://x' },
      join(root, 'web'),
    );

    expect(env).toEqual({ CI: 'true', DATABASE_URL: 'postgres://x' });
  });
});
