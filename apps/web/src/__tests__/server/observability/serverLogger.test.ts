import { describe, expect, it, vi } from 'vitest';
import {
  createServerLogger,
  describeError,
  describeRequest,
  SERVER_LIB,
  SERVER_LOG_EVENTS,
} from '#/server/observability/serverLogger';

const CONFIG = { captureUrl: 'https://eu.i.posthog.com/i/v0/e/', apiKey: 'phc_public' };
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
    newId: () => 'random-id',
  });
  return { logger, lines, fetchFn };
}

interface CaptureBody {
  api_key: string;
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

function sentBody(fetchFn: ReturnType<typeof vi.fn>): CaptureBody {
  const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as CaptureBody;
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
  it('sends one $exception event to the capture URL with the project key', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(
      SERVER_LOG_EVENTS.SSR_FAILED,
      { ...describeRequest(sensitiveRequest()), phase: 'load', routeId: '/reset-password' },
      new Error('boom'),
    );

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.captureUrl);
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(sentBody(fetchFn)).toEqual({
      api_key: 'phc_public',
      event: '$exception',
      distinct_id: 'fra1::abcde-123',
      timestamp: NOW.toISOString(),
      properties: {
        $exception_list: [
          {
            type: 'Error',
            value: 'boom',
            mechanism: { type: 'generic', handled: false, synthetic: false },
            stacktrace: { type: 'raw', frames: expect.any(Array) },
          },
        ],
        $exception_level: 'error',
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: SERVER_LIB,
        source: 'server',
        service: 'trakwyn-web',
        release: 'abc123',
        web_event: 'web.ssr.failed',
        'http.method': 'GET',
        'url.path': '/reset-password',
        'vercel.request_id': 'fra1::abcde-123',
        phase: 'load',
        routeId: '/reset-password',
      },
    });
  });

  it('never sends the query string, cookies or authorization header', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(
      SERVER_LOG_EVENTS.REQUEST_FAILED,
      describeRequest(sensitiveRequest()),
      new Error('boom'),
    );

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = init.body as string;
    expect(body).not.toContain('RESET-TOKEN-123');
    expect(body).not.toContain('trakwyn_access_token');
    expect(body).not.toContain('eyJ');
    expect(body).not.toContain('Bearer');
  });

  it('uses a random distinct id, not a person, when there is no Vercel request id', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.SERVER_FN_FAILED, { 'server_fn.name': 'fn' });

    expect(sentBody(fetchFn)).toMatchObject({
      distinct_id: 'random-id',
      properties: { $process_person_profile: false },
    });
  });

  it('applies the deny-list to fields a caller passes', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.REQUEST_FAILED, {
      cookie: 'trakwyn_access_token=abc',
      authorization: 'Bearer abc',
      variables: { salary: 90000 },
    });

    expect(sentBody(fetchFn).properties).toMatchObject({
      cookie: '[redacted]',
      authorization: '[redacted]',
      variables: '[redacted]',
    });
  });

  it('writes a flat, scrubbed line to stdout, so Vercel keeps a copy', async () => {
    const { logger, lines } = setup();

    await logger.error(
      SERVER_LOG_EVENTS.SERVER_FN_FAILED,
      { 'server_fn.name': 'fn' },
      new Error('boom for jane@example.com'),
    );

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      _time: NOW.toISOString(),
      service: 'trakwyn-web',
      level: 'error',
      release: 'abc123',
      event: 'web.server_fn.failed',
      'server_fn.name': 'fn',
      'error.type': 'Error',
      'error.message': expect.not.stringContaining('jane@example.com'),
      'error.stack': expect.any(String),
    });
  });

  it('only writes to stdout when export is disabled', async () => {
    const { logger, lines, fetchFn } = setup(null);

    await logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {}, new Error('boom'));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
  });

  it('reports a rejected capture by status, and resolves', async () => {
    const { logger, lines } = setup(
      CONFIG,
      async () => new Response('{"detail":"invalid api key"}', { status: 401 }),
    );

    await expect(logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {})).resolves.toBeUndefined();

    const failure = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(failure).toMatchObject({ event: 'web.log.ingest_failed', status: 401 });
    expect(lines[1]).not.toContain('invalid api key');
  });

  it('resolves even when the capture request itself throws', async () => {
    const { logger, lines } = setup(CONFIG, async () => {
      throw new TypeError('fetch failed');
    });

    await expect(logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {})).resolves.toBeUndefined();
    expect(JSON.parse(lines[1])).toMatchObject({
      event: 'web.log.ingest_failed',
      'error.type': 'TypeError',
    });
  });

  it('resolves even when building the event throws', async () => {
    const lines: string[] = [];
    const logger = createServerLogger({
      config: CONFIG,
      fetchFn: vi.fn(async () => new Response(null, { status: 200 })),
      write: (line) => lines.push(line),
      newId: () => {
        throw new Error('no randomness');
      },
    });

    await expect(logger.error(SERVER_LOG_EVENTS.SERVER_FN_FAILED, {})).resolves.toBeUndefined();
    expect(JSON.parse(lines[1])).toMatchObject({ event: 'web.log.ingest_failed' });
  });

  it('bounds the capture request with a timeout', async () => {
    const { logger, fetchFn } = setup();

    await logger.error(SERVER_LOG_EVENTS.SSR_FAILED, {});

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('names every reportable event with a .failed suffix', () => {
    const reportable = Object.values(SERVER_LOG_EVENTS).filter(
      (event) => event !== SERVER_LOG_EVENTS.INGEST_FAILED,
    );
    for (const event of reportable) {
      expect(event).toMatch(/^web\..+\.failed$/);
    }
  });
});
