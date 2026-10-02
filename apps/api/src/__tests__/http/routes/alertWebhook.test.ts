import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '#src/http/container.js';
import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import { ALERT_WEBHOOK_EVENTS, ROUTES } from '#src/http/constants.js';
import { alertWebhookRoutes } from '#src/http/routes/alertWebhook.routes.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

const SECRET = 'the-alert-secret';

const validBody = {
  action: 'Open',
  monitorId: 'mon1',
  title: 'Scheduled job failed',
  description: 'A job threw.',
  timestamp: '2026-09-30T10:00:05Z',
  value: '0',
  matchedEvent: { attributes: { event: 'job.digest.failed' } },
};

interface Outcome {
  status: number;
  sent: unknown;
}

function request(body: unknown = validBody, authorization = `Bearer ${SECRET}`): IHttpRequest {
  return {
    method: 'POST',
    path: ROUTES.AXIOM_ALERT_WEBHOOK,
    headers: { authorization },
    cookies: {},
    params: {},
    query: {},
    body,
    ip: null,
    protocol: 'https',
  };
}

async function run(
  req: IHttpRequest,
  execute = vi
    .fn()
    .mockResolvedValue({ outcome: 'created', issue: { identifier: 'JEF-1', url: 'u' } }),
  logger: ILogger = makeLogger(),
): Promise<Outcome & { execute: typeof execute; logger: ILogger }> {
  const outcome: Outcome = { status: 200, sent: undefined };
  const res: IHttpResponse = {
    status: (code) => {
      outcome.status = code;
      return res;
    },
    header: () => res,
    send: (body) => {
      outcome.sent = body;
    },
    redirect: () => undefined,
    setCookie: () => undefined,
    clearCookie: () => undefined,
  };
  const cradle = { logger, fileAlertIssueUseCase: { execute } } as unknown as Cradle;
  const [route] = alertWebhookRoutes(() => cradle);
  expect(route!.path).toBe(ROUTES.AXIOM_ALERT_WEBHOOK);
  await route!.handler(req, res);
  return { ...outcome, execute, logger };
}

describe('POST /webhooks/axiom-alerts', () => {
  beforeEach(() => {
    vi.stubEnv(ENV.ALERT_WEBHOOK_SECRET, SECRET);
    vi.stubEnv(ENV.LINEAR_API_KEY, 'lin_api_key');
    vi.stubEnv(ENV.LINEAR_TEAM_ID, 'team-uuid');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 503 when the relay is not configured', async () => {
    vi.stubEnv(ENV.LINEAR_API_KEY, '');

    const { status, execute } = await run(request());

    expect(status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong secret', `Bearer nope`],
    ['no bearer prefix', SECRET],
    ['a longer secret', `Bearer ${SECRET}x`],
  ])('refuses %s with 401 and logs the rejection', async (_label, authorization) => {
    const { status, execute, logger } = await run(request(validBody, authorization));

    expect(status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Alert webhook rejected', undefined, {
      event: ALERT_WEBHOOK_EVENTS.REJECTED,
    });
  });

  it('answers 400 for a body that is not an Axiom alert', async () => {
    const { status, sent, execute } = await run(request({ hello: 'world' }));

    expect(status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(sent)).toContain('monitorId');
  });

  it('hands a valid alert to the use case and answers 202 with the outcome', async () => {
    const { status, sent, execute, logger } = await run(request());

    expect(status).toBe(202);
    expect(sent).toEqual({ outcome: 'created', issue: 'JEF-1' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Axiom', state: 'open', title: 'Scheduled job failed' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Alert webhook handled',
      expect.objectContaining({ event: ALERT_WEBHOOK_EVENTS.HANDLED, outcome: 'created' }),
    );
  });

  it('answers 202 for a skipped alert too, so Axiom does not count it as a failed delivery', async () => {
    const { status, sent } = await run(
      request(),
      vi.fn().mockResolvedValue({ outcome: 'ignored_closed' }),
    );

    expect(status).toBe(202);
    expect(sent).toEqual({ outcome: 'ignored_closed', issue: null });
  });

  it('answers 502 and logs when the tracker fails', async () => {
    const failure = new Error('Linear API request failed (500): down');
    const { status, logger } = await run(request(), vi.fn().mockRejectedValue(failure));

    expect(status).toBe(502);
    expect(logger.error).toHaveBeenCalledWith(
      'Alert webhook failed to file an issue',
      failure,
      expect.objectContaining({ event: ALERT_WEBHOOK_EVENTS.FAILED }),
    );
  });
});
