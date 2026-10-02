import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import corsPlugin from '#src/http/adapters/fastify/corsPlugin.js';
import { ENV } from '#src/infrastructure/config/constants.js';

async function buildApp(corsOrigin: string): Promise<FastifyInstance> {
  process.env[ENV.CORS_ORIGIN] = corsOrigin;
  const app = Fastify();
  await app.register(corsPlugin);
  app.get('/probe', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('corsPlugin', () => {
  const originalCorsOrigin = process.env[ENV.CORS_ORIGIN];
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    app = null;
  });

  afterEach(async () => {
    await app?.close();
    if (originalCorsOrigin === undefined) delete process.env[ENV.CORS_ORIGIN];
    else process.env[ENV.CORS_ORIGIN] = originalCorsOrigin;
  });

  it('allows a listed origin and echoes it back with credentials', async () => {
    app = await buildApp('https://www.trakwyn.com');

    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://www.trakwyn.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://www.trakwyn.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses an unlisted origin without failing the request', async () => {
    app = await buildApp('https://www.trakwyn.com');

    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://claude.ai' },
    });

    // Refused, not failed. Omitting the header is what enforces CORS — the
    // browser blocks the response. A 500 here would misreport a routine
    // cross-origin request as the API falling over.
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses an unlisted origin on a preflight without a 500', async () => {
    app = await buildApp('https://www.trakwyn.com');

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/probe',
      headers: {
        origin: 'https://claude.ai',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.statusCode).not.toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows a request with no Origin header at all', async () => {
    app = await buildApp('https://www.trakwyn.com');

    // curl, server-to-server calls, and MCP clients that are not browsers.
    const res = await app.inject({ method: 'GET', url: '/probe' });

    expect(res.statusCode).toBe(200);
  });

  it('allows browser-extension and Vercel preview origins', async () => {
    app = await buildApp('https://www.trakwyn.com');

    for (const origin of [
      'chrome-extension://abcdef',
      'safari-web-extension://0F2A6B1C-3D4E-4F50-8A9B-C0D1E2F3A4B5',
      'https://trakwyn-preview.vercel.app',
    ]) {
      const res = await app.inject({ method: 'GET', url: '/probe', headers: { origin } });
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('allows PUT on a preflight, so cross-origin PUT routes (e.g. local document upload) are reachable', async () => {
    // Regression: @fastify/cors defaults `methods` to GET,HEAD,POST (the
    // CORS-spec "simple" methods) when not configured — every route here
    // was GraphQL POST until the local-storage upload PUT route, whose
    // preflight silently omitted PUT and made the browser drop the real
    // request before it was ever sent.
    app = await buildApp('https://www.trakwyn.com');

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/probe',
      headers: {
        origin: 'https://www.trakwyn.com',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(res.headers['access-control-allow-methods']).toContain('PUT');
  });

  it('tolerates spaces after the commas in CORS_ORIGIN', async () => {
    app = await buildApp('https://www.trakwyn.com, https://admin.trakwyn.com');

    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://admin.trakwyn.com' },
    });

    // Writing the list with spaces is the natural thing to do, and without
    // trimming the second entry silently never matches.
    expect(res.headers['access-control-allow-origin']).toBe('https://admin.trakwyn.com');
  });
});
