jest.mock('../../lib/analytics', () => ({ addBreadcrumb: jest.fn() }));

import { addBreadcrumb } from '../../lib/analytics';
import { RequestTimeoutError, operationName, withRequestTimeout } from '../requestTimeout';

const mockedAddBreadcrumb = jest.mocked(addBreadcrumb);

/** A request that never answers on its own, and rejects the way fetch does when aborted. */
function hangingRequest(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')));
  });
}

describe('operationName', () => {
  it.each([
    ['query Me { me { id } }', 'Me'],
    ['mutation UpdateApplication($id: ID!) { x }', 'UpdateApplication'],
    ['\n  query   Applications_2 {\n a }', 'Applications_2'],
    ['query { ok }', 'anonymous'],
    ['{ ok }', 'anonymous'],
  ])('reads %j as %s', (query, expected) => {
    expect(operationName(query)).toBe(expected);
  });
});

describe('withRequestTimeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('abandons a request that outlives the limit, as a network failure', async () => {
    const result = withRequestTimeout('query Me { me { id } }', 20_000, hangingRequest);
    const settled = result.catch((e: unknown) => e);

    jest.advanceTimersByTime(20_000);
    const error = await settled;

    expect(error).toBeInstanceOf(RequestTimeoutError);
    // What getErrorMessage and the refresh path treat as "never reached the server".
    expect(error).toBeInstanceOf(TypeError);
    expect((error as RequestTimeoutError).operation).toBe('Me');
  });

  it('records a breadcrumb naming the operation, and nothing else', async () => {
    const settled = withRequestTimeout(
      'mutation Login($email: String!) { x }',
      1_000,
      hangingRequest,
    ).catch(() => undefined);

    jest.advanceTimersByTime(1_000);
    await settled;

    expect(mockedAddBreadcrumb).toHaveBeenCalledWith('Request timed out', { operation: 'Login' });
  });

  it('does not abort a request that answers in time', async () => {
    let seen: AbortSignal | undefined;
    const result = await withRequestTimeout('query Me { me }', 1_000, async (signal) => {
      seen = signal;
      return { me: 1 };
    });

    jest.advanceTimersByTime(5_000);

    expect(result).toEqual({ me: 1 });
    expect(seen?.aborted).toBe(false);
    expect(mockedAddBreadcrumb).not.toHaveBeenCalled();
  });

  it('passes other failures through unchanged, without a timeout breadcrumb', async () => {
    const failure = new TypeError('Network request failed');

    await expect(
      withRequestTimeout('query Me { me }', 1_000, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(mockedAddBreadcrumb).not.toHaveBeenCalled();
  });
});
