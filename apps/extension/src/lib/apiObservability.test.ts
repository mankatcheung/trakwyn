import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getCurrentUser, login, refreshToken } from './api';
import { clearAuth, getAuth } from './storage';
import { captureEvent, wasReported } from './observability/report';
import { getLastTraceId } from './observability/traceContext';
import { OBSERVABILITY_EVENTS } from '../constants';

vi.mock('./storage', () => ({
  getAuth: vi.fn(),
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  getApiUrl: vi.fn(async () => 'https://api.example.com/graphql'),
}));

// The reporter's own behaviour is report.test.ts; here it is only observed.
vi.mock('./observability/report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./observability/report')>()),
  captureEvent: vi.fn(async () => undefined),
}));

const fetchMock = vi.fn();

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce({ status, json: async () => body });
}

function respondWithHtml(status: number): void {
  fetchMock.mockResolvedValueOnce({
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  });
}

function eventsNamed(name: string): Array<Record<string, unknown>> {
  return vi
    .mocked(captureEvent)
    .mock.calls.filter(([event]) => event === name)
    .map(([, properties]) => properties ?? {});
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(captureEvent).mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getAuth).mockResolvedValue({
    token: 'tok',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 10 * 60_000,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trace context', () => {
  it('sends a fresh traceparent to the API and remembers its trace id', async () => {
    respond(200, { data: { me: { id: 'u1' } } });
    respond(200, { data: { me: { id: 'u1' } } });

    await getCurrentUser();
    await getCurrentUser();

    const [first, second] = fetchMock.mock.calls.map(
      ([url, init]) => [url, (init as { headers: Record<string, string> }).headers] as const,
    );
    expect(first[0]).toBe('https://api.example.com/graphql');
    expect(first[1].traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(second[1].traceparent).not.toBe(first[1].traceparent);
    expect(second[1].traceparent).toContain(getLastTraceId());
  });
});

describe('transport failures', () => {
  it('reports an unreachable API with the operation and trace id', async () => {
    const failure = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValueOnce(failure);

    await expect(getCurrentUser()).rejects.toBe(failure);

    expect(eventsNamed(OBSERVABILITY_EVENTS.GRAPHQL_REQUEST_FAILED)).toEqual([
      { network_error: true, operation: 'Me', trace_id: getLastTraceId() },
    ]);
    // So the popup does not report the same failure again as an exception.
    expect(wasReported(failure)).toBe(true);
  });

  it('reports a 5xx with its status, keeping the API message for the user', async () => {
    respond(500, { errors: [{ message: 'Boom', extensions: { code: 'INTERNAL_ERROR' } }] });

    const err = await getCurrentUser().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Boom');
    expect(eventsNamed(OBSERVABILITY_EVENTS.GRAPHQL_REQUEST_FAILED)).toEqual([
      { status: 500, operation: 'Me', trace_id: getLastTraceId() },
    ]);
  });

  it('reports a 5xx that is not JSON, and says so readably', async () => {
    respondWithHtml(502);

    const err = await getCurrentUser().catch((e: unknown) => e);

    expect((err as Error).message).toMatch(/didn't answer as expected/);
    expect(eventsNamed(OBSERVABILITY_EVENTS.GRAPHQL_REQUEST_FAILED)).toEqual([
      { status: 502, operation: 'Me', trace_id: getLastTraceId() },
    ]);
  });

  it('does not report a 4xx or a domain error', async () => {
    respond(400, { errors: [{ message: 'Invalid', extensions: { code: 'VALIDATION' } }] });
    respond(200, { errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }] });
    respondWithHtml(404);

    await getCurrentUser().catch(() => undefined);
    await getCurrentUser().catch(() => undefined);
    const notFound = await getCurrentUser().catch((e: unknown) => e);

    expect(captureEvent).not.toHaveBeenCalled();
    expect(wasReported(notFound)).toBe(false);
    // A mistyped API URL is the user's to fix: shown, never filed as a bug.
    expect(notFound).toBeInstanceOf(ApiError);
  });
});

describe('login', () => {
  it('fails with an ApiError, not a fault, when 2FA is required', async () => {
    respond(200, {
      data: { loginMobile: { totpRequired: true, accessToken: null, refreshToken: null } },
    });

    const err = await login('ada@example.com', 'pw').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/two-factor/);
    expect(captureEvent).not.toHaveBeenCalled();
  });
});

describe('refreshToken', () => {
  it('reports a rejected refresh token with the API code, then signs out', async () => {
    respond(200, { errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }] });

    await expect(refreshToken()).resolves.toBe(false);

    expect(eventsNamed(OBSERVABILITY_EVENTS.TOKEN_REFRESH_FAILED)).toEqual([
      { reason: 'rejected', code: 'UNAUTHORIZED' },
    ]);
    expect(eventsNamed(OBSERVABILITY_EVENTS.GRAPHQL_REQUEST_FAILED)).toEqual([]);
    expect(clearAuth).toHaveBeenCalled();
  });

  it('reports an unreachable API as a transport failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(refreshToken()).resolves.toBe(false);

    expect(eventsNamed(OBSERVABILITY_EVENTS.TOKEN_REFRESH_FAILED)).toEqual([
      { reason: 'transport' },
    ]);
    expect(eventsNamed(OBSERVABILITY_EVENTS.GRAPHQL_REQUEST_FAILED)).toHaveLength(1);
  });

  it('never reports the refresh token itself', async () => {
    vi.mocked(getAuth).mockResolvedValue({
      token: 'tok',
      refreshToken: 'rt-secret-value',
      expiresAt: Date.now() + 10 * 60_000,
    });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await refreshToken();

    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain('rt-secret-value');
  });

  it('reports nothing when there is no session to refresh', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);

    await expect(refreshToken()).resolves.toBe(false);

    expect(captureEvent).not.toHaveBeenCalled();
  });
});
