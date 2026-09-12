import { rmSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Stops the API this run started — and only that one: a server that was
 * already up when the run began is somebody else's (a dev server, usually),
 * so it is left alone.
 */
export default async function globalTeardown(): Promise<void> {
  const api = globalThis.__TRAKWYN_API__;
  globalThis.__TRAKWYN_API__ = undefined;
  if (!api || api.reused) return;

  if (api.pid !== undefined) {
    try {
      // Negative pid signals the whole detached process group: `pnpm` execs a
      // shell which execs tsx, and only the leaf holds the port.
      process.kill(-api.pid, 'SIGTERM');
    } catch {
      // Already gone — nothing to stop.
    }
  }

  if (api.dbFile) rmSync(dirname(api.dbFile), { recursive: true, force: true });
}
