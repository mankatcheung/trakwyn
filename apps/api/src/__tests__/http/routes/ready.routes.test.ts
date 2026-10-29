import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '#src/http/container.js';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import { ROUTES } from '#src/http/constants.js';
import { readyRoutes } from '#src/http/routes/ready.routes.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

/**
 * CI's post-deploy smoke test (JEF-476) calls this on a revision that has no
 * traffic yet. `/health` only proves the process booted; this must fail when
 * the revision cannot reach its database.
 */

interface Sent {
  status: number;
  body: unknown;
}

function makeResponse(sent: Sent): IHttpResponse {
  const res: IHttpResponse = {
    status: (code) => {
      sent.status = code;
      return res;
    },
    header: () => res,
    send: (body) => {
      sent.body = body;
    },
    redirect: () => undefined,
    setCookie: () => undefined,
    clearCookie: () => undefined,
  };
  return res;
}

const request: IHttpRequest = {
  method: 'GET',
  path: ROUTES.READY,
  headers: {},
  cookies: {},
  params: {},
  query: {},
  body: undefined,
  ip: null,
  protocol: 'https',
};

async function call(execute: () => Promise<unknown>) {
  const logger = makeLogger();
  const [route] = readyRoutes(() => ({ db: { execute }, logger }) as unknown as Cradle);
  const sent: Sent = { status: 200, body: undefined };
  await route!.handler(request, makeResponse(sent));
  return { sent, logger };
}

describe('GET /ready', () => {
  it('is registered as a GET on the ready path', () => {
    const [route] = readyRoutes(() => ({}) as Cradle);
    expect(route).toMatchObject({ method: 'GET', path: '/ready' });
  });

  it('answers 200 when the database answers', async () => {
    const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

    const { sent } = await call(execute);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(sent).toEqual({ status: 200, body: { status: 'ok' } });
  });

  it('answers 503 and logs the cause when the query fails', async () => {
    const { sent, logger } = await call(() => Promise.reject(new Error('connection refused')));

    expect(sent.status).toBe(503);
    expect(sent.body).toEqual({ status: 'unavailable' });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does not put the failure reason in the response body', async () => {
    const { sent } = await call(() => Promise.reject(new Error('password authentication failed')));

    expect(JSON.stringify(sent.body)).not.toContain('password');
  });
});
