import { GraphQLClient, ClientError } from 'graphql-request';

jest.mock('../../auth/tokenStorage', () => ({
  getTokens: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));
jest.mock('../../lib/userAgent', () => ({
  buildUserAgent: () => 'TrakwynMobile/test (Test; TestOS 1)',
}));

const mockCaptureException = jest.fn();
const mockAddBreadcrumb = jest.fn();

// Only the reporting half is replaced: `isApiRequest` and `newTraceContext`
// stay real, so the traceparent assertions below exercise the actual
// origin check rather than a stub of it.
jest.mock('../../lib/analytics', () => ({
  ...(jest.requireActual('../../lib/analytics') as object),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}));

import { getTokens, setTokens, clearTokens } from '../../auth/tokenStorage';
import {
  gqlRequest,
  getValidAccessToken,
  recoverFromUnauthorized,
  setAccessToken,
  onSessionExpired,
  traceHeaders,
  addTraceparent,
} from '../client';
import { GQL_REQUEST_TIMEOUT_MS } from '../../constants';

const mockedGetTokens = jest.mocked(getTokens);
const mockedSetTokens = jest.mocked(setTokens);
const mockedClearTokens = jest.mocked(clearTokens);

// The real GraphQLClient class is used (so `new GraphQLClient(...)` inside
// client.ts still produces a real instance ClientError.response checks work
// against), with only its `request` method replaced per-test.
const requestSpy = jest.spyOn(GraphQLClient.prototype, 'request');

function unauthorizedError(): ClientError {
  return new ClientError(
    { errors: [{ extensions: { code: 'UNAUTHORIZED' } }] } as never,
    { query: '' } as never,
  );
}

/** An unsigned JWT whose payload carries only `exp` — client.ts reads that and nothing else. */
function jwtExpiringAt(epochSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: epochSeconds }));
  return `header.${payload}.signature`;
}
const freshJwt = () => jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600);
const staleJwt = () => jwtExpiringAt(Math.floor(Date.now() / 1000) - 60);

const storedPair = { accessToken: 'stale-token', refreshToken: 'refresh-token' };
const refreshedPair = { accessToken: 'fresh-token', refreshToken: 'new-refresh-token' };
const refreshResponse = { refreshTokenMobile: refreshedPair };

const isRefreshCall = (call: unknown[]) =>
  String((call[0] as { document: unknown }).document).includes('refreshTokenMobile');

/** The object-form request gqlRequest sends: the document, its headers, and the timeout signal (JEF-367). */
const sentRequest = (document: string, requestHeaders: Record<string, string> | undefined) =>
  expect.objectContaining({ document, requestHeaders, signal: expect.any(AbortSignal) });

describe('gqlRequest', () => {
  let listener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
    mockedSetTokens.mockResolvedValue(undefined);
    mockedClearTokens.mockResolvedValue(undefined);
    listener = jest.fn();
    onSessionExpired(listener);
  });

  it('attaches the current access token as a bearer header', async () => {
    setAccessToken('token-123');
    requestSpy.mockResolvedValueOnce({ me: { id: '1' } });

    await gqlRequest('query Me { me { id } }');

    expect(requestSpy).toHaveBeenCalledWith(
      sentRequest('query Me { me { id } }', { authorization: 'Bearer token-123' }),
    );
  });

  it('sends no authorization header when unauthenticated', async () => {
    requestSpy.mockResolvedValueOnce({ ok: true });

    await gqlRequest('query { ok }');

    expect(requestSpy).toHaveBeenCalledWith(sentRequest('query { ok }', undefined));
  });

  it('returns the response on success without touching the token store', async () => {
    requestSpy.mockResolvedValueOnce({ ok: true });

    await expect(gqlRequest('query { ok }')).resolves.toEqual({ ok: true });
    expect(mockedGetTokens).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on an UNAUTHORIZED error, then succeeds', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy
      .mockRejectedValueOnce(unauthorizedError()) // original request
      .mockResolvedValueOnce(refreshResponse) // refresh call
      .mockResolvedValueOnce({ me: { id: '1' } }); // retried original request

    const result = await gqlRequest<{ me: { id: string } }>('query Me { me { id } }');

    expect(result).toEqual({ me: { id: '1' } });
    expect(mockedSetTokens).toHaveBeenCalledWith(refreshedPair);
    // Final retry uses the freshly-refreshed access token.
    expect(requestSpy).toHaveBeenLastCalledWith(
      sentRequest('query Me { me { id } }', { authorization: 'Bearer fresh-token' }),
    );
  });

  // No token was sent, so UNAUTHORIZED is about the request — a wrong
  // password on the login screen — not about a session. Nothing to refresh,
  // nothing to clear, nobody to notify.
  it('leaves the session alone when an unauthenticated request is UNAUTHORIZED', async () => {
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await expect(gqlRequest('mutation { loginMobile }')).rejects.toThrow();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(mockedGetTokens).not.toHaveBeenCalled();
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not refresh or replay a credential mutation that opted out', async () => {
    setAccessToken(freshJwt());
    requestSpy.mockRejectedValueOnce(unauthorizedError()); // "Invalid password"

    await expect(
      gqlRequest('mutation { updatePassword }', undefined, { refreshOnUnauthorized: false }),
    ).rejects.toThrow();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(mockedGetTokens).not.toHaveBeenCalled();
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('refreshes a lapsed token *before* sending a credential mutation that opted out', async () => {
    setAccessToken(staleJwt());
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy
      .mockResolvedValueOnce(refreshResponse) // proactive refresh
      .mockResolvedValueOnce({ updatePassword: true }); // the mutation itself

    await gqlRequest('mutation { updatePassword }', undefined, { refreshOnUnauthorized: false });

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(isRefreshCall(requestSpy.mock.calls[0]!)).toBe(true);
    expect(requestSpy).toHaveBeenLastCalledWith(
      sentRequest('mutation { updatePassword }', { authorization: 'Bearer fresh-token' }),
    );
  });

  it('ends the session when the refresh token itself is rejected', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce({ ...storedPair, refreshToken: 'dead-refresh-token' });
    requestSpy
      .mockRejectedValueOnce(unauthorizedError()) // original request
      .mockRejectedValueOnce(unauthorizedError()); // refreshTokenMobile: "Session revoked or expired"

    await expect(gqlRequest('query { ok }')).rejects.toThrow();

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ends the session when there is no stored pair to refresh with', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(null);
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await expect(gqlRequest('query { ok }')).rejects.toThrow();

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // A transport failure says nothing about the refresh token — deleting it
  // would turn a subway tunnel into a permanent sign-out.
  it('keeps the tokens when the refresh request cannot reach the server', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    const original = unauthorizedError();
    requestSpy
      .mockRejectedValueOnce(original) // original request
      .mockRejectedValueOnce(new TypeError('Network request failed')); // refresh never landed

    await expect(gqlRequest('query { ok }')).rejects.toBe(original);

    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  // Once the server has rotated, the old pair on disk would be presented on
  // the next launch and read as a stolen token — a clean sign-out is safer.
  it('ends the session when the refreshed pair cannot be persisted', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    mockedSetTokens.mockRejectedValueOnce(new Error('keystore unavailable'));
    requestSpy
      .mockRejectedValueOnce(unauthorizedError()) // original request
      .mockResolvedValueOnce(refreshResponse); // refresh succeeds server-side

    await expect(gqlRequest('query { ok }')).rejects.toThrow();

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('retries with the current token, without refreshing, when another request already refreshed in flight', async () => {
    setAccessToken('old-token');
    requestSpy
      .mockImplementationOnce(async () => {
        // Simulates a concurrent request's refresh landing while this one was out.
        setAccessToken('fresh-from-elsewhere');
        throw unauthorizedError();
      })
      .mockResolvedValueOnce({ ok: true });

    await expect(gqlRequest('query { ok }')).resolves.toEqual({ ok: true });

    expect(mockedGetTokens).not.toHaveBeenCalled();
    expect(requestSpy).toHaveBeenLastCalledWith(
      sentRequest('query { ok }', { authorization: 'Bearer fresh-from-elsewhere' }),
    );
  });

  it('single-flights the refresh across concurrent UNAUTHORIZED responses', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValue(storedPair);
    requestSpy
      .mockRejectedValueOnce(unauthorizedError()) // request A
      .mockRejectedValueOnce(unauthorizedError()) // request B
      .mockResolvedValueOnce(refreshResponse) // the one shared refresh
      .mockResolvedValueOnce({ a: true })
      .mockResolvedValueOnce({ b: true });

    const [a, b] = await Promise.all([gqlRequest('query { a }'), gqlRequest('query { b }')]);

    expect(a).toEqual({ a: true });
    expect(b).toEqual({ b: true });
    expect(requestSpy.mock.calls.filter(isRefreshCall)).toHaveLength(1);
  });
});

describe('getValidAccessToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
    mockedSetTokens.mockResolvedValue(undefined);
    mockedClearTokens.mockResolvedValue(undefined);
  });

  it('returns null when there is no token at all', async () => {
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mockedGetTokens).not.toHaveBeenCalled();
  });

  it('returns a token that is nowhere near expiry without a round-trip', async () => {
    const token = freshJwt();
    setAccessToken(token);

    await expect(getValidAccessToken()).resolves.toBe(token);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('refreshes a token that is about to lapse and returns the new one', async () => {
    setAccessToken(staleJwt());
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockResolvedValueOnce(refreshResponse);

    await expect(getValidAccessToken()).resolves.toBe('fresh-token');
    expect(mockedSetTokens).toHaveBeenCalledWith(refreshedPair);
  });

  it('treats an unparseable token as lapsed', async () => {
    setAccessToken('not-a-jwt');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockResolvedValueOnce(refreshResponse);

    await expect(getValidAccessToken()).resolves.toBe('fresh-token');
  });

  it('returns the stale token when the refresh cannot reach the server', async () => {
    const token = staleJwt();
    setAccessToken(token);
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(getValidAccessToken()).resolves.toBe(token);
    expect(mockedClearTokens).not.toHaveBeenCalled();
  });

  it('returns null and ends the session when the refresh token is rejected', async () => {
    const listener = jest.fn();
    onSessionExpired(listener);
    setAccessToken(staleJwt());
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(mockedClearTokens).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('recoverFromUnauthorized', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
    mockedSetTokens.mockResolvedValue(undefined);
    mockedClearTokens.mockResolvedValue(undefined);
  });

  it('hands back the current token when it already changed since the request was sent', async () => {
    setAccessToken('newer');

    await expect(recoverFromUnauthorized('older')).resolves.toEqual({
      kind: 'retry',
      token: 'newer',
    });
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('refreshes and hands back the new token', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockResolvedValueOnce(refreshResponse);

    await expect(recoverFromUnauthorized('stale-token')).resolves.toEqual({
      kind: 'retry',
      token: 'fresh-token',
    });
  });

  it('reports the session as ended, and ends it, when the refresh token is rejected', async () => {
    const listener = jest.fn();
    onSessionExpired(listener);
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await expect(recoverFromUnauthorized('stale-token')).resolves.toEqual({ kind: 'ended' });
    expect(mockedClearTokens).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports the server as unreachable without touching the tokens', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(recoverFromUnauthorized('stale-token')).resolves.toEqual({
      kind: 'unreachable',
    });
    expect(mockedClearTokens).not.toHaveBeenCalled();
  });
});

/**
 * JEF-349. Two things the mobile app now does on its own behalf: it tells
 * PostHog when a session ends for a reason the API will never hear about,
 * and it gives the API a trace id it can root its own trace on.
 */
describe('reporting a rejected refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
    mockedSetTokens.mockResolvedValue(undefined);
    mockedClearTokens.mockResolvedValue(undefined);
  });

  it('reports the rejection, which is what signs the user out', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await recoverFromUnauthorized('stale-token');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'token_refresh_rejected' }),
    );
  });

  it('stays quiet when the refresh merely could not reach the server', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(new TypeError('Network request failed'));

    await recoverFromUnauthorized('stale-token');

    // The session survives an unreachable server, so there is nothing to
    // report — only a breadcrumb, for the trail behind a later crash.
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledWith('Token refresh unreachable');
  });

  it('reports a refresh that succeeded but could not be stored', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockResolvedValueOnce(refreshResponse);
    mockedSetTokens.mockRejectedValueOnce(new Error('SecureStore unavailable'));

    await recoverFromUnauthorized('stale-token');

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'token_storage_write_failed' }),
    );
  });

  it('leaves a breadcrumb for a secure-storage read that threw', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockRejectedValueOnce(new Error('DecryptException'));

    await recoverFromUnauthorized('stale-token');

    expect(mockAddBreadcrumb).toHaveBeenCalledWith('Secure storage read failed');
  });

  // The whole point of the scrubber, checked at the one call site most
  // likely to carry a token: the error being reported *is* about tokens.
  it('never lets a token value into the payload', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockRejectedValueOnce(unauthorizedError());

    await recoverFromUnauthorized('stale-token');

    const serialised = JSON.stringify(mockCaptureException.mock.calls);
    expect(serialised).not.toContain(storedPair.refreshToken);
    expect(serialised).not.toContain(storedPair.accessToken);
  });

  it('never lets a token value into a breadcrumb either', () => {
    const serialised = JSON.stringify(mockAddBreadcrumb.mock.calls);
    expect(serialised).not.toContain(storedPair.refreshToken);
  });
});

/** A request that never answers, rejecting only when its timeout signal fires — what a dead connection looks like. */
function hangUntilAborted({ signal }: { signal?: AbortSignal }): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  });
}

describe('request timeout (JEF-367)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    setAccessToken(null);
  });
  afterEach(() => jest.useRealTimers());

  it('gives up on an unanswered request after GQL_REQUEST_TIMEOUT_MS and says which one', async () => {
    requestSpy.mockImplementationOnce(hangUntilAborted as never);

    const settled = gqlRequest('query Applications { applications { id } }').catch(
      (e: unknown) => e,
    );
    await jest.advanceTimersByTimeAsync(GQL_REQUEST_TIMEOUT_MS);
    const error = await settled;

    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).name).toBe('RequestTimeoutError');
    expect(mockAddBreadcrumb).toHaveBeenCalledWith('Request timed out', {
      operation: 'Applications',
    });
  });

  it('keeps the session when the refresh itself times out', async () => {
    setAccessToken('stale-token');
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    requestSpy.mockImplementationOnce(hangUntilAborted as never);
    const listener = jest.fn();
    onSessionExpired(listener);

    const recovery = recoverFromUnauthorized('stale-token');
    await jest.advanceTimersByTimeAsync(GQL_REQUEST_TIMEOUT_MS);

    await expect(recovery).resolves.toEqual({ kind: 'unreachable' });
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledWith('Request timed out', {
      operation: 'RefreshTokenMobile',
    });
  });
});

describe('traceparent propagation', () => {
  it('sends a valid traceparent to the API', () => {
    expect(traceHeaders('http://localhost:3001/graphql').traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
  });

  it('sends the header to the chat SSE route, which is the API under another path', () => {
    expect(traceHeaders('http://localhost:3001/chat/stream')).toHaveProperty('traceparent');
  });

  it('sends nothing to a third-party origin', () => {
    expect(traceHeaders('https://abc.public.blob.vercel-storage.com/upload')).toEqual({});
  });

  it('gives each request its own trace id', () => {
    const first = traceHeaders('http://localhost:3001/graphql').traceparent;
    const second = traceHeaders('http://localhost:3001/graphql').traceparent;
    expect(first).not.toBe(second);
  });
});

/**
 * The middleware graphql-request actually calls. The `gqlRequest` tests
 * above spy on `GraphQLClient.prototype.request`, which bypasses the
 * fetcher entirely, so nothing there exercises this — which is how a
 * middleware that dropped every header shipped green.
 */
describe('addTraceparent', () => {
  /** The request graphql-request hands to `requestMiddleware`, headers and all. */
  function graphqlRequestStub(overrides: Partial<{ url: string; headers: Headers }> = {}) {
    return {
      url: 'http://localhost:3001/graphql',
      headers: new Headers({
        accept: 'application/graphql-response+json, application/json',
        'content-type': 'application/json',
        'user-agent': 'TrakwynMobile/test (Test; TestOS 1)',
      }),
      ...overrides,
    };
  }

  it('adds a valid traceparent', () => {
    const out = addTraceparent(graphqlRequestStub());

    expect(out.headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  // Regression: `{ ...request.headers }` on a `Headers` instance yields `{}`.
  // graphql-request passes a `Headers` (its fetcher does
  // `new Headers(params.headers)` and sets Accept and Content-Type before any
  // middleware runs), so spreading dropped the content type and the
  // User-Agent the API turns into the session's device label.
  it('keeps every header graphql-request already set', () => {
    const out = addTraceparent(graphqlRequestStub());

    expect(out.headers.get('content-type')).toBe('application/json');
    expect(out.headers.get('accept')).toBe('application/graphql-response+json, application/json');
    expect(out.headers.get('user-agent')).toBe('TrakwynMobile/test (Test; TestOS 1)');
  });

  it('keeps the bearer token a request carries', () => {
    const out = addTraceparent({
      url: 'http://localhost:3001/graphql',
      headers: new Headers({ authorization: 'Bearer token-123' }),
    });

    expect(out.headers.get('authorization')).toBe('Bearer token-123');
    expect(out.headers.get('traceparent')).toMatch(/^00-/);
  });

  it('adds nothing when the request is not to the API', () => {
    const out = addTraceparent(
      graphqlRequestStub({ url: 'https://abc.public.blob.vercel-storage.com/upload' }),
    );

    expect(out.headers.get('traceparent')).toBeNull();
    expect(out.headers.get('content-type')).toBe('application/json');
  });

  it('leaves the rest of the request init untouched', () => {
    const out = addTraceparent({ ...graphqlRequestStub(), operationName: 'Applications' });

    expect(out.url).toBe('http://localhost:3001/graphql');
    expect(out.operationName).toBe('Applications');
  });
});
