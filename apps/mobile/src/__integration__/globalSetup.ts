import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { API_BASE_URL, BOOT_TIMEOUT_MS, apiEnv, pingApi } from './support/apiProcess';

const REPO_ROOT = resolve(__dirname, '../../../..');

/**
 * Boots apps/api for the integration tier: a throwaway SQLite file, migrations,
 * then the same `pnpm --filter @trakwyn/api dev` command apps/web's Playwright
 * config uses. An API already answering on the port is reused rather than
 * fought over — `reuseExistingServer` in playwright.config.ts makes the same
 * call, so running these suites next to a dev server behaves the way the
 * repo's other server-backed tests already do.
 *
 * The child is started detached so teardown can signal the whole process group:
 * `pnpm` execs a shell which execs `tsx`, and killing only the pnpm pid would
 * leave the server holding the port.
 */
export default async function globalSetup(): Promise<void> {
  if (await pingApi()) {
    globalThis.__TRAKWYN_API__ = { reused: true };
    console.log(`\n[integration] reusing the API already answering at ${API_BASE_URL}`);
    return;
  }

  const dbFile = join(mkdtempSync(join(tmpdir(), 'trakwyn-integration-')), 'integration.db');
  const env = apiEnv(dbFile);

  await run('pnpm', ['--filter', '@trakwyn/api', 'db:migrate:apply'], env);

  const child = spawn('pnpm', ['--filter', '@trakwyn/api', 'dev'], {
    cwd: REPO_ROOT,
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Kept only so a boot failure can say why, rather than "timed out".
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`[integration] the API exited during boot (${child.exitCode}):\n${stderr}`);
    }
    if (await pingApi()) {
      globalThis.__TRAKWYN_API__ = { reused: false, pid: child.pid, dbFile };
      console.log(`\n[integration] API up at ${API_BASE_URL} (pid ${child.pid})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  child.kill('SIGKILL');
  throw new Error(
    `[integration] the API did not answer at ${API_BASE_URL} within ${BOOT_TIMEOUT_MS}ms:\n${stderr}`,
  );
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
