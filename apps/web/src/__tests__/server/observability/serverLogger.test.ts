import { describe, expect, it, vi } from 'vitest';
import {
  createServerLogger,
  describeError,
  describeRequest,
  SERVER_LOG_EVENTS,
} from '#/server/observability/serverLogger';

const CONFIG = { ingestUrl: 'https://axiom.test/v1/ingest/trakwyn-web', token: 'xaat-secret' };
const NOW = new Date('2026-09-24T12:00:00.000Z');

function setup(config: typeof CONFIG | null = CONFIG, fetchImpl?: typeof fetch) {
  const lines: string[] = [];
  const fetchFn = vi.fn(fetchImpl ?? (async () => new Response(null, { status: 200 })));
  const logger = createServerLogger({
    config,
    release: 'abc123',
    fetchFn,
    write: (line) => lines.push(line),
    now: () => NOW,
  });
  return { logger, lines, fetchFn };
}

function sentRecords(fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>[];
}

/** A request carrying every secret a page request can: query token, cookies, bearer. */
function sensitiveRequest(): Request {
  return new Request('https://www.trakwyn.com/reset-password?token=RESET-TOKEN-123#frag', {
    headers: {
      cookie: 'trakwyn_access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig; trakwyn_logged_in=1',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
      'x-vercel-id': 'fra1::abcde-123',
    },
  });
}

describe('describeRequest', () => {
  it('keeps the method, the path and the Vercel request id only', () => {
    expect(describeRequest(sensitiveRequest())).toEqual({
      'http.method': 'GET',
      'url.path': '/reset-password',
      'vercel.request_id': 'fra1::abcde-123',
    });
  });

  it('never carries the query string, cookies or authorization header', () => {
    const serialized = JSON.stringify(describeRequest(sensitiveRequest()));
    expect(serialized).not.toContain('RESET-TOKEN-123');
    expect(serialized).not.toContain('trakwyn_access_token');
    expect(serialized).not.toContain('eyJ');
    expect(serialized).not.toContain('Bearer');
  });

  it('omits the request id when Vercel did not set one', () => {
    expect(describeRequest(new Request('https://www.trakwyn.com/share'))).not.toHaveProperty(
      'vercel.request_id',
    );
  });
});

describe('describeError', () => {
  it('redacts emails, tokens and query strings from the message and stack', () => {
    const error = new Error(
      'failed for jane@example.com at https://api.trakwyn.com/x?token=abc with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    );
    const described = describeError(error);
    expect(described['error.type']).toBe('Error');
    for (const value of [described['error.message'], described['error.stack']]) {
      expect(value).not.toContain('jane@example.com');
      expect(value).not.toContain('token=abc');
      expect(value).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    }
  });

  it('reports only the type of a non-Error throw, never its value', () => {
    expect(describeError('password=hunter2')).toEqual({ 'error.type': 'string' });
  });
});

describe('createServerLogger', () => {
  it('sends one scrubbed record to the ingest URL with the token as a bearer header', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(
      SERVER_LOG_EVENTS.SSR_FAILED,
      { ...describeRequest(sensitiveRequest()), phase: 'load', routeId: '/reset-password' },
      new Error('boom'),
    );

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.ingestUrl);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer xaat-secret' });
    expect(sentRecords(fetchFn)).toEqual([
      {
        _time: NOW.toISOString(),
        level: 'error',
        service: 'trakwyn-web',
        release: 'abc123',
        event: 'web.ssr.failed',
        'http.method': 'GET',
        'url.path': '/reset-password',
        'vercel.request_id': 'fra1::abcde-123',
        phase: 'load',
        routeId: '/reset-password',
        'error.type': 'Error',
        'error.message': 'boom',
        'error.stack': expect.stringContaining('Error: boom'),
      },
    ]);
  });

  it('applies the deny-list to fields a caller passes', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.REQUEST_FAILED, {
      cookie: 'trakwyn_access_token=abc',
      authorization: 'Bearer abc',
      variables: { salary: 90000 },
    });

    expect(sentRecords(fetchFn)[0]).toMatchObject({
      cookie: '[redacted]',
      authorization: '[redacted]',
      variables: '[redacted]',
    });
  });

  it('writes the same record to stdout, so Vercel keeps a scrubbed copy', async () => {
    const { logger, lines, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.SERVER_FN_FAILED, { 'server_fn.name': 'fn' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(sentRecords(fetchFn)[0]);
  });

  it('never puts the ingest token in a log line', async () => {
    const { logger, lines } = setup(CONFIG, async () => new Response(null, { status: 403 }));

    await logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {});

    expect(lines.join('\n')).not.toContain('xaat-secret');
  });

  it('only writes to stdout when export is disabled', async () => {
    const { logger, lines, fetchFn } = setup(null);

    await logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {}, new Error('boom'));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
  });

  it('reports a rejected ingest by status, and resolves', async () => {
    const { logger, lines } = setup(
      CONFIG,
      async () => new Response('{"message":"dataset not found"}', { status: 404 }),
    );

    await expect(logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {})).resolves.toBeUndefined();

    const failure = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(failure).toMatchObject({ event: 'web.log.ingest_failed', status: 404 });
    expect(lines[1]).not.toContain('dataset not found');
  });

  it('resolves even when the ingest request itself throws', async () => {
    const { logger, lines } = setup(CONFIG, async () => {
      throw new TypeError('fetch failed');
    });

    await expect(logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {})).resolves.toBeUndefined();
    expect(JSON.parse(lines[1])).toMatchObject({
      event: 'web.log.ingest_failed',
      'error.type': 'TypeError',
    });
  });

  it('bounds the ingest request with a timeout', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {});

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('names every reportable event with a .failed suffix, which the Axiom monitor keys on', () => {
    const reportable = Object.values(SERVER_LOG_EVENTS).filter(
      (event) => event !== SERVER_LOG_EVENTS.INGEST_FAILED,
    );
    for (const event of reportable) {
      expect(event).toMatch(/^web\..+\.failed$/);
    }
  });
});
