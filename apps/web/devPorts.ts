import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The ports one checkout's dev servers listen on (web, API).
//
// The main checkout and CI use 3000 and 3001. `pnpm setup:worktree` gives every
// linked worktree its own pair and writes them to apps/web/.env as WEB_PORT and
// API_PORT (and PORT in apps/api/.env), so agents working in parallel worktrees
// can each run the dev servers, e2e tests and screenshots without taking the
// same ports. Read here, in Node, by the vite config, the Playwright configs,
// the e2e specs that call the API directly, and codegen. Not a `VITE_` variable:
// the browser reaches the API through the dev proxy, never by port.

export const DEFAULT_WEB_PORT = 3000;
export const DEFAULT_API_PORT = 3001;

/** One `KEY=value` from an env file, without loading the file into `process.env`. */
function readEnvFile(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, 'utf8')
    .split('\n')
    .find((l) => new RegExp(`^${key}\\s*=`).test(l));
  return line
    ?.slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function portFrom(key: string, fallback: number): number {
  const raw = process.env[key] || readEnvFile(resolve(import.meta.dirname, '.env'), key);
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

export const webPort = portFrom('WEB_PORT', DEFAULT_WEB_PORT);
export const apiPort = portFrom('API_PORT', DEFAULT_API_PORT);
export const webOrigin = `http://localhost:${webPort}`;
export const apiOrigin = `http://localhost:${apiPort}`;

/**
 * The second API the `integration-plans` project boots, with `PLANS_ENFORCED`
 * on (JEF-667). A fixed offset from the checkout's API port, so each worktree
 * has its own pair and none of them lands in the 3100+ range worktrees draw from.
 */
export const PLANS_API_PORT_OFFSET = 1000;
export const plansApiPort = apiPort + PLANS_API_PORT_OFFSET;
export const plansApiOrigin = `http://localhost:${plansApiPort}`;
