import {
  getLastTraceId,
  isApiRequest,
  newTraceContext,
  rememberTraceId,
  resetTraceContext,
} from '../traceContext';

describe('newTraceContext', () => {
  it('produces a W3C traceparent the API can adopt without translation', () => {
    const { traceId, traceparent } = newTraceContext();

    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(traceparent).toContain(traceId);
    expect(traceId).toHaveLength(32);
  });

  it('gives every request its own trace id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTraceContext().traceId));
    expect(ids.size).toBe(50);
  });

  // React Native has no `crypto.getRandomValues`, which is why this uses
  // expo-crypto at all. If that import were ever swapped for the web API,
  // ids would come back as a run of zeroes rather than throwing.
  it('never emits the all-zero trace id, which the W3C spec makes invalid', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(newTraceContext().traceId).not.toBe('0'.repeat(32));
    }
  });
});

describe('isApiRequest', () => {
  const API = 'https://api.trakwyn.com/graphql';

  it('accepts another path on the API origin — the chat SSE route', () => {
    expect(isApiRequest('https://api.trakwyn.com/chat/stream', API)).toBe(true);
  });

  it('accepts the local dev endpoint', () => {
    expect(isApiRequest('http://localhost:3001/graphql', 'http://localhost:3001/graphql')).toBe(
      true,
    );
  });

  it('refuses a third-party host', () => {
    expect(isApiRequest('https://abc.public.blob.vercel-storage.com/x', API)).toBe(false);
  });

  it('refuses a look-alike host that merely starts with the API origin', () => {
    expect(isApiRequest('https://api.trakwyn.com.evil.test/graphql', API)).toBe(false);
  });

  it('refuses a different port on the same host', () => {
    expect(isApiRequest('http://localhost:3000/graphql', 'http://localhost:3001/graphql')).toBe(
      false,
    );
  });

  it('refuses rather than guesses when a URL cannot be parsed', () => {
    expect(isApiRequest('/graphql', API)).toBe(false);
  });
});

describe('the remembered trace id', () => {
  beforeEach(() => resetTraceContext());
  afterEach(() => resetTraceContext());

  it('starts empty, so an exception before any request claims no trace', () => {
    expect(getLastTraceId()).toBeNull();
  });

  it('holds the most recent request, which is the one an error just followed', () => {
    rememberTraceId('a'.repeat(32));
    rememberTraceId('b'.repeat(32));
    expect(getLastTraceId()).toBe('b'.repeat(32));
  });
});
