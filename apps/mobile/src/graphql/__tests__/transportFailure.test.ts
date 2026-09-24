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

// Only the reporting is replaced; the trace context and the predicate stay
// real so the assertions cover what actually reaches PostHog.
jest.mock('../../lib/analytics', () => ({
  ...(jest.requireActual('../../lib/analytics') as object),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: jest.fn(),
}));

import { getTokens, setTokens } from '../../auth/tokenStorage';
import { getLastTraceId, rememberTraceId } from '../../lib/analytics';
import { addTraceparent, gqlRequest, setAccessToken } from '../client';
import { RequestTimeoutError } from '../requestTimeout';

const requestSpy = jest.spyOn(GraphQLClient.prototype, 'request');

const QUERY = 'query ApplicationDetail($id: ID!) { application(id: $id) { id } }';

function httpError(status: number, code?: string): ClientError {
  return new ClientError(
    {
      status,
      headers: new Headers(),
      errors: code ? [{ message: code, extensions: { code } }] : undefined,
    } as never,
    { query: QUERY } as never,
  );
}

const networkError = () => new TypeError('Network request failed');

/** The trace id the `n`th request (0-based) was sent with. */
function traceIdOfCall(n: number): string {
  const [options] = requestSpy.mock.calls[n] as unknown as [
    { requestHeaders: Record<string, string> },
  ];
  return options.requestHeaders.traceparent?.split('-')[1] ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  setAccessToken(null);
  jest.mocked(setTokens).mockResolvedValue(undefined);
});

describe('gqlRequest failure reporting', () => {
  it('reports a 5xx with its status, operation and the failing request’s trace id', async () => {
    const error = httpError(503);
    requestSpy.mockRejectedValueOnce(error);

    await expect(gqlRequest(QUERY, { id: '1' })).rejects.toBe(error);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      kind: 'graphql_request_failed',
      status: 503,
      operation: 'ApplicationDetail',
      trace_id: traceIdOfCall(0),
    });
  });

  it('reports an unreachable API as a network error', async () => {
    const error = networkError();
    requestSpy.mockRejectedValueOnce(error);

    await expect(gqlRequest(QUERY)).rejects.toBe(error);

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      kind: 'graphql_request_failed',
      network_error: true,
      operation: 'ApplicationDetail',
      trace_id: traceIdOfCall(0),
    });
  });

  it.each([
    ['a 4xx', () => httpError(400)],
    ['a domain-coded GraphQL error', () => httpError(200, 'NOT_FOUND')],
    ['a validation error', () => httpError(200, 'VALIDATION')],
    ['a wrong password on login', () => httpError(200, 'UNAUTHORIZED')],
  ])('does not report %s', async (_label, makeError) => {
    requestSpy.mockRejectedValueOnce(makeError());

    await expect(gqlRequest(QUERY)).rejects.toThrow();

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not report an UNAUTHORIZED that recovers after the refresh', async () => {
    setAccessToken('stale-token');
    jest
      .mocked(getTokens)
      .mockResolvedValueOnce({ accessToken: 'stale-token', refreshToken: 'refresh-token' });
    requestSpy
      .mockRejectedValueOnce(httpError(200, 'UNAUTHORIZED'))
      .mockResolvedValueOnce({
        refreshTokenMobile: { accessToken: 'fresh-token', refreshToken: 'next' },
      })
      .mockResolvedValueOnce({ application: { id: '1' } });

    await expect(gqlRequest(QUERY)).resolves.toEqual({ application: { id: '1' } });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('reports a retry that fails once, under the retry’s own trace id', async () => {
    setAccessToken('stale-token');
    jest
      .mocked(getTokens)
      .mockResolvedValueOnce({ accessToken: 'stale-token', refreshToken: 'refresh-token' });
    const error = httpError(502);
    requestSpy
      .mockRejectedValueOnce(httpError(200, 'UNAUTHORIZED')) // original request
      .mockResolvedValueOnce({
        refreshTokenMobile: { accessToken: 'fresh-token', refreshToken: 'next' },
      }) // refresh
      .mockRejectedValueOnce(error); // retry

    await expect(gqlRequest(QUERY)).rejects.toBe(error);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ status: 502, trace_id: traceIdOfCall(2) }),
    );
    expect(traceIdOfCall(2)).not.toBe(traceIdOfCall(0));
  });

  it('names the failing request even when another request has started since', async () => {
    let fail: (error: Error) => void = () => {};
    requestSpy.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );

    const pending = gqlRequest(QUERY);
    // A later request on another screen moves the shared last-trace id on.
    rememberTraceId('f'.repeat(32));
    fail(httpError(500));
    await expect(pending).rejects.toThrow();

    expect(getLastTraceId()).toBe('f'.repeat(32));
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trace_id: traceIdOfCall(0) }),
    );
  });
});

describe('operation and timeout', () => {
  // The name comes from requestTimeout.ts's `operationName`, shared with the
  // timeout breadcrumb, so both name an unnamed query the same way.
  it('reports an anonymous query as `anonymous`', async () => {
    requestSpy.mockRejectedValueOnce(networkError());

    await expect(gqlRequest('{ ok }')).rejects.toThrow();

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'anonymous' }),
    );
  });

  it('reports a request timeout (JEF-367) as a network error', async () => {
    const error = new RequestTimeoutError('ApplicationDetail');
    requestSpy.mockRejectedValueOnce(error);

    await expect(gqlRequest(QUERY)).rejects.toBe(error);

    expect(mockCaptureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ network_error: true, operation: 'ApplicationDetail' }),
    );
  });
});

describe('addTraceparent with a caller-supplied traceparent', () => {
  it('keeps it rather than minting another', () => {
    const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`;
    const request = addTraceparent({
      url: 'http://localhost:3001/graphql',
      headers: { traceparent },
    });

    expect(new Headers(request.headers).get('traceparent')).toBe(traceparent);
  });
});
