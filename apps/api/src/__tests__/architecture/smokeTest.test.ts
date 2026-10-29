import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `.github/scripts/smoke-test.sh` is what ci.yml runs against a Cloud Run
 * revision that has no traffic yet, and against Vercel after a deploy
 * (JEF-476). It decides whether a deploy is promoted or rolled back, so it is
 * run here against a real local server: a script that always exits 0 would
 * turn the whole gate into decoration.
 */

const REPO = join(process.cwd(), '..', '..');
const SCRIPT = join(REPO, '.github/scripts/smoke-test.sh');
const run = promisify(execFile);

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server | undefined;

async function serve(handler: Handler): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function smoke(mode: string, url: string): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await run(SCRIPT, [mode, url], {
      env: { ...process.env, SMOKE_ATTEMPTS: '3', SMOKE_DELAY: '0' },
    });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, output: failed.stdout + failed.stderr };
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

afterEach(async () => {
  const open = server;
  server = undefined;
  if (open?.listening) await new Promise<void>((resolve) => open.close(() => resolve()));
});

describe('smoke-test.sh api', () => {
  const healthy: Handler = (req, res) => {
    if (req.url === '/ready') return json(res, 200, { status: 'ok' });
    if (req.url === '/graphql' && req.method === 'POST') {
      return json(res, 200, { data: { __typename: 'Query' } });
    }
    return json(res, 404, {});
  };

  it('passes when /ready and GraphQL both answer', async () => {
    const url = await serve(healthy);

    expect((await smoke('api', url)).code).toBe(0);
  });

  it('fails when /ready answers 503, which is a revision that cannot reach its database', async () => {
    const url = await serve((req, res) =>
      req.url === '/ready' ? json(res, 503, { status: 'unavailable' }) : healthy(req, res),
    );

    const result = await smoke('api', url);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('/ready');
  });

  it('fails when GraphQL does not answer with data', async () => {
    const url = await serve((req, res) =>
      req.url === '/graphql'
        ? json(res, 200, { errors: [{ message: 'boom' }] })
        : healthy(req, res),
    );

    const result = await smoke('api', url);

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('GraphQL');
  });

  it('keeps trying while a cold revision boots, then passes', async () => {
    let calls = 0;
    const url = await serve((req, res) =>
      req.url === '/ready' && ++calls < 3 ? json(res, 503, {}) : healthy(req, res),
    );

    expect((await smoke('api', url)).code).toBe(0);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('fails when nothing is listening', async () => {
    const url = await serve(healthy);
    await new Promise<void>((resolve) => server!.close(() => resolve()));

    expect((await smoke('api', url)).code).not.toBe(0);
  });
});

describe('smoke-test.sh web', () => {
  it('passes on a 200 HTML page', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><body>Trakwyn</body></html>');
    });

    expect((await smoke('web', url)).code).toBe(0);
  });

  it('fails on a 500', async () => {
    const url = await serve((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });

    expect((await smoke('web', url)).code).not.toBe(0);
  });

  it('fails on a 200 that is not a page', async () => {
    const url = await serve((_req, res) => json(res, 200, { ok: true }));

    expect((await smoke('web', url)).code).not.toBe(0);
  });
});

describe('smoke-test.sh usage', () => {
  it('refuses an unknown mode', async () => {
    const result = await smoke('database', 'http://127.0.0.1:1');

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('usage');
  });

  it('refuses a missing url', async () => {
    const result = await smoke('api', '');

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('usage');
  });
});
