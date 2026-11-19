import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// The environment a local Playwright run starts its servers with (JEF-656).
//
// `.env.e2e` is a gitignored copy of the committed `.env.e2e.example` beside it,
// made by hand or by `pnpm setup:worktree`. CI copies the same example to `.env`
// (its one difference is a Postgres `DATABASE_URL`, set on the job), so a local
// run and CI start the servers with the same values. Read here, in Node, by
// playwright.config.ts, which hands the result to each `webServer`. Like
// devPorts.ts it sits outside `src/`: the config imports it, the app does not.

export type EnvVars = Record<string, string>;
export type E2eApp = 'api' | 'web';

/** Where an app's `.env.e2e` lives, given this app's directory (apps/web). */
export function e2eEnvFile(app: E2eApp, webDir: string = import.meta.dirname): string {
  return resolve(webDir, '..', app, '.env.e2e');
}

/**
 * The variables for one app's web server: its `.env.e2e` under the shell's own
 * environment. A variable the shell already sets wins, as it does with dotenv, so
 * `PLANS_ENFORCED=true pnpm test:e2e` still overrides the file. With no file
 * (CI, or a checkout that never made one) this is the shell environment alone.
 *
 * The whole shell environment is included because Playwright gives a server
 * exactly the `env` it is handed, with no `process.env` merged underneath.
 */
export function webServerEnv(
  app: E2eApp,
  shell: Readonly<Record<string, string | undefined>> = process.env,
  webDir: string = import.meta.dirname,
): EnvVars {
  const path = e2eEnvFile(app, webDir);
  const fromFile = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};

  const merged: EnvVars = {};
  for (const [key, value] of Object.entries({ ...fromFile, ...shell })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
