import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { apiOrigin, apiPort, webOrigin } from '../../../devPorts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');

export const API_GRAPHQL_URL = `${apiOrigin}/graphql`;
export const BOOT_TIMEOUT_MS = 90_000;

/** True once the API answers a real GraphQL request, not merely once the port accepts a socket. */
export async function pingApi(): Promise<boolean> {
  try {
    const response = await fetch(API_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The same ephemeral configuration the mobile integration tier uses: a throwaway
 * PGlite database, fake OAuth and LLM providers, an email provider that logs.
 * Nothing here is a secret, so the tier runs on a fork's pull request.
 */
export function apiEnv(dataDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: String(apiPort),
    NODE_ENV: 'development',
    DATABASE_URL: `pglite:${dataDir}`,
    JWT_SECRET: 'integration-only-jwt-secret',
    JWT_REFRESH_SECRET: 'integration-only-refresh-secret',
    TOTP_ENCRYPTION_KEY: 'integration-only-totp-encryption-key',
    LLM_API_KEY_ENCRYPTION_KEY: 'integration-only-llm-encryption-key',
    STORAGE_PROVIDER: 'local',
    CACHE_PROVIDER: 'memory',
    EMAIL_PROVIDER: 'console',
    CORS_ORIGIN: webOrigin,
    WEB_APP_ORIGIN: webOrigin,
    API_ORIGIN: apiOrigin,
    COOKIE_DOMAIN: '',
    OAUTH_PROVIDER_MODE: 'fake',
    LLM_PROVIDER_MODE: 'fake',
    // Tracing would otherwise try to reach Axiom from a test run.
    AXIOM_TOKEN: '',
    AXIOM_DATASET: '',
    AXIOM_METRICS_DATASET: '',
  };
}

export interface BootedApi {
  /** False when an API was already answering: it is somebody else's and is left running. */
  readonly owned: boolean;
  stop(): void;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`[integration] ${command} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

function stopGroup(child: ChildProcess, dataDir: string): void {
  if (child.pid !== undefined) {
    try {
      // Negative pid signals the whole detached group: `pnpm` execs a shell
      // which execs tsx, and only the leaf holds the port.
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  rmSync(dirname(dataDir), { recursive: true, force: true });
}

/**
 * Boots apps/api with the command Playwright uses, on a throwaway database. An
 * API already answering on the port is reused, as `reuseExistingServer` does.
 */
export async function bootApi(): Promise<BootedApi> {
  if (await pingApi()) {
    console.log(`\n[integration] reusing the API already answering at ${API_GRAPHQL_URL}`);
    return { owned: false, stop: () => {} };
  }

  const dataDir = join(mkdtempSync(join(tmpdir(), 'trakwyn-web-integration-')), 'pglite');
  const env = apiEnv(dataDir);
  await run('pnpm', ['--filter', '@trakwyn/api', 'db:migrate:apply'], env);

  const child = spawn('pnpm', ['--filter', '@trakwyn/api', 'dev'], {
    cwd: REPO_ROOT,
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      stopGroup(child, dataDir);
      throw new Error(`[integration] the API exited during boot (${child.exitCode}):\n${stderr}`);
    }
    if (await pingApi()) {
      console.log(`\n[integration] API up at ${API_GRAPHQL_URL} (pid ${child.pid})`);
      return { owned: true, stop: () => stopGroup(child, dataDir) };
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  stopGroup(child, dataDir);
  throw new Error(
    `[integration] the API did not answer at ${API_GRAPHQL_URL} within ${BOOT_TIMEOUT_MS}ms:\n${stderr}`,
  );
}
