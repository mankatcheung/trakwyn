// Runs before `tsx watch` in `pnpm dev` and fails fast when the API's port is
// already taken.
//
// Without it a second API (another worktree's, or one an agent forgot) hits
// EADDRINUSE and exits, but `tsx watch` itself keeps running, idle, waiting for a
// file change: a process that looks alive and serves nothing, and that nothing
// ever stops. Failing here leaves no process behind, and says who holds the port.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';

const DEFAULT_PORT = 3001;

function portFromEnvFile() {
  if (!existsSync('.env')) return undefined;
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => /^PORT\s*=/.test(l));
  return line
    ?.split('=')[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '');
}

function holderOf(port) {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((l) => l.startsWith('p'))
      .map((l) => l.slice(1))
      .filter((pid, i, all) => all.indexOf(pid) === i)
      .map((pid) => {
        const cwd = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
          encoding: 'utf8',
        })
          .split('\n')
          .find((l) => l.startsWith('n'));
        return `pid ${pid} (cwd ${cwd?.slice(1) ?? 'unknown'})`;
      })
      .join(', ');
  } catch {
    return 'an unknown process';
  }
}

const port = Number(process.env.PORT ?? portFromEnvFile() ?? DEFAULT_PORT);

const server = createServer();
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use by ${holderOf(port)}.\n` +
        'Stop that server first (in a worktree: `pnpm stop:worktree`), or set PORT.',
    );
    process.exit(1);
  }
  throw err;
});
server.listen(port, '0.0.0.0', () => server.close());
