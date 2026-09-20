import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
}));

interface RequestStub {
  url: string;
  operationName?: string;
  // A `Headers` instance, because that is what graphql-request actually
  // passes: its fetcher does `new Headers(params.headers)` and sets Accept
  // and Content-Type on it *before* any middleware runs. A plain object here
  // would let a middleware that spreads `{...request.headers}` pass the
  // tests while stripping every header in production.
  headers?: Headers;
}

type Middleware = (response: unknown, request?: RequestStub) => Promise<void>;
type RealMiddleware = (response: unknown, request: RequestStub) => Promise<void>;
type RequestMiddleware = (request: RequestStub) => RequestStub;

/** The request graphql-request hands to `requestMiddleware`, headers and all. */
function graphqlRequestStub(overrides: Partial<RequestStub> = {}): RequestStub {
  return {
    url: 'http://localhost:3000/graphql',
    headers: new Headers({
      accept: 'application/graphql-response+json, application/json',
      'content-type': 'application/json',
    }),
    ...overrides,
  };
}

const DEFAULT_REQUEST: RequestStub = { url: 'http://localhost:3000/graphql' };

const { mockPosthog } = vi.hoisted(() => ({
  mockPosthog: {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({ default: mockPosthog }));

// GraphQLClient must be a real constructor (not an arrow fn) to support `new`
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn(function (
    this: { responseMiddleware: Middleware; requestMiddleware?: RequestMiddleware },
    _url: string,
    opts: { responseMiddleware?: RealMiddleware; requestMiddleware?: RequestMiddleware },
  ) {
    const real = opts?.responseMiddleware;
    // graphql-request always supplies the request alongside the response;
    // defaulting it here keeps the call sites below to a single argument.
    this.responseMiddleware = real
      ? (response, request = DEFAULT_REQUEST) => real(response, request)
      : () => Promise.resolve();
    this.requestMiddleware = opts?.requestMiddleware;
  }),
}));

const mockLocationHref = vi.fn();

/**
 * The base stub mirrors a visitor on the marketing root (`pathname: '/'`),
 * which is why plain-`/login` redirects stay unparameterised. Tests that
 * need a deeper current URL redefine this — hence `configurable`.
 */
function stubWindowLocation(fields: { pathname?: string; search?: string; hash?: string } = {}) {
  Object.defineProperty(window, 'location', {
    value: {
      origin: 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: '',
      ...fields,
      set href(v: string) {
        mockLocationHref(v);
      },
    },
    writable: true,
    configurable: true,
  });
}

stubWindowLocation();

describe('gqlClient endpoint resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', '/graphql');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the default relative endpoint to an absolute URL, which graphql-request requires', async () => {
    // Regression: graphql-request's `new URL(endpoint)` throws on a bare
    // relative path like '/graphql' (the documented dev default) — this
    // broke every real request (e.g. registration) despite every unit test
    // mocking gqlClient and never exercising the real constructor.
    const { GraphQLClient } = await import('graphql-request');
    await import('#/graphql/client');

    const [urlArg] = vi.mocked(GraphQLClient).mock.calls.at(-1)!;
    expect(() => new URL(urlArg as string)).not.toThrow();
    expect(urlArg).toBe(`${window.location.origin}/graphql`);
  });
});

describe('refresh token deduplication', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.resetModules();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    mockLocationHref.mockClear();
  });

  it('only makes one refresh request when called concurrently', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: 'new-access-token' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;
    const unauthorized = { errors: [{ extensions: { code: 'UNAUTHORIZED' } }] };

    await Promise.all([
      middleware(unauthorized),
      middleware(unauthorized),
      middleware(unauthorized),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when refresh fails', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: null } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    expect(mockLocationHref).toHaveBeenCalledWith('/login');
  });

  it('carries the current deep path to /login as returnTo (JEF-233)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: null } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    stubWindowLocation({ pathname: '/applications', search: '?status=applied' });
    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    expect(mockLocationHref).toHaveBeenCalledWith(
      `/login?returnTo=${encodeURIComponent('/applications?status=applied')}`,
    );
  });

  it('does not parameterise /login when the user is on the landing page', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: null } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    stubWindowLocation({ pathname: '/' });
    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    expect(mockLocationHref).toHaveBeenCalledWith('/login');
  });

  it.each(['/login', '/register'])(
    'stays put when the dead session is discovered on %s',
    async (pathname) => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ data: { refreshToken: null } }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      stubWindowLocation({ pathname });
      const { gqlClient } = await import('#/graphql/client');
      const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
        .responseMiddleware;

      await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

      expect(mockLocationHref).not.toHaveBeenCalled();
    },
  );

  it('does not refresh when response has no UNAUTHORIZED error', async () => {
    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware({ data: { applications: [] } });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not refresh when response is an Error instance', async () => {
    const { gqlClient } = await import('#/graphql/client');
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware(new Error('network error'));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('hasSessionCookie', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Expire every cookie set during the tests below so state doesn't leak across them.
    for (const name of ['trakwyn_logged_in', 'trakwyn_logged_in_other', 'some_other_cookie']) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });

  it('returns false when the hint cookie is absent (no network call involved)', async () => {
    const { hasSessionCookie } = await import('#/graphql/client');
    expect(hasSessionCookie()).toBe(false);
  });

  it('returns true when the hint cookie is present', async () => {
    document.cookie = 'trakwyn_logged_in=1';
    const { hasSessionCookie } = await import('#/graphql/client');
    expect(hasSessionCookie()).toBe(true);
  });

  it('returns true when the hint cookie is present alongside others', async () => {
    document.cookie = 'some_other_cookie=abc';
    document.cookie = 'trakwyn_logged_in=1';
    const { hasSessionCookie } = await import('#/graphql/client');
    expect(hasSessionCookie()).toBe(true);
  });

  it('does not false-positive on a cookie name that merely starts with the same prefix', async () => {
    document.cookie = 'trakwyn_logged_in_other=1';
    const { hasSessionCookie } = await import('#/graphql/client');
    expect(hasSessionCookie()).toBe(false);
  });
});

/**
 * JEF-349. Two separate promises are being kept here: that the API gets a
 * W3C `traceparent` it can adopt as the root of its own trace, and that
 * nobody else does.
 */
describe('traceparent propagation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', '/graphql');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadClient() {
    const { GraphQLClient } = await import('graphql-request');
    const module = await import('#/graphql/client');
    const instance = vi.mocked(GraphQLClient).mock.instances.at(-1) as unknown as {
      requestMiddleware: RequestMiddleware;
    };
    return { ...module, requestMiddleware: instance.requestMiddleware };
  }

  it('sends a valid traceparent on every GraphQL request', async () => {
    const { requestMiddleware } = await loadClient();

    const out = requestMiddleware(graphqlRequestStub());

    expect(out.headers?.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it('gives each request its own trace id rather than reusing one per page', async () => {
    const { requestMiddleware } = await loadClient();

    const first = requestMiddleware(graphqlRequestStub()).headers?.get('traceparent');
    const second = requestMiddleware(graphqlRequestStub()).headers?.get('traceparent');

    expect(first).not.toBe(second);
  });

  // Regression: `{ ...request.headers }` on a `Headers` instance yields `{}`,
  // which dropped Content-Type and Accept from every GraphQL request and
  // broke all of them. Nothing the caller set may be lost.
  it('keeps the headers graphql-request already set', async () => {
    const { requestMiddleware } = await loadClient();

    const out = requestMiddleware(graphqlRequestStub());

    expect(out.headers?.get('content-type')).toBe('application/json');
    expect(out.headers?.get('accept')).toBe('application/graphql-response+json, application/json');
  });

  it('keeps headers given as a plain object, the other shape HeadersInit allows', async () => {
    const { requestMiddleware } = await loadClient();

    const out = requestMiddleware({
      url: 'http://localhost:3000/graphql',
      headers: new Headers({ authorization: 'Bearer token-123' }),
    });

    expect(out.headers?.get('authorization')).toBe('Bearer token-123');
    expect(out.headers?.get('traceparent')).toMatch(/^00-/);
  });

  it('leaves the rest of the request init untouched', async () => {
    const { requestMiddleware } = await loadClient();

    const out = requestMiddleware(
      graphqlRequestStub({ operationName: 'Applications' }),
    ) as RequestStub & { url: string };

    expect(out.url).toBe('http://localhost:3000/graphql');
    expect(out.operationName).toBe('Applications');
  });

  it('sends nothing to a third-party origin — the blob upload host is the live case', async () => {
    const { traceHeaders } = await loadClient();

    expect(traceHeaders('https://abc.public.blob.vercel-storage.com/upload')).toEqual({});
  });

  it('sends the header to the chat SSE route, which is the API under another path', async () => {
    const { traceHeaders, CHAT_STREAM_URL } = await loadClient();

    expect(traceHeaders(CHAT_STREAM_URL)).toHaveProperty('traceparent');
  });

  it('attaches the header to the raw refresh fetch too, not only to gqlClient', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: 'new' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { gqlClient } = await loadClient();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;
    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).traceparent).toMatch(/^00-[0-9a-f]{32}-/);
    fetchSpy.mockRestore();
  });
});

describe('failure reporting', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mockPosthog).forEach((fn) => fn.mockReset());
    vi.stubEnv('VITE_API_URL', '/graphql');
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    stubWindowLocation();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mockLocationHref.mockClear();
  });

  async function loadInitialised() {
    const module = await import('#/graphql/client');
    await (await import('#/lib/analytics/analytics')).initAnalytics();
    return module;
  }

  it('reports a network failure, which is the API being unreachable', async () => {
    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware(new Error('Failed to fetch'), {
      url: 'http://localhost:3000/graphql',
      operationName: 'Applications',
    });

    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'graphql_request_failed', network_error: true }),
    );
  });

  it('names the operation, which is the one identifying detail that is safe to send', async () => {
    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware(new Error('Failed to fetch'), {
      url: 'http://localhost:3000/graphql',
      operationName: 'Applications',
    });

    const [, properties] = mockPosthog.captureException.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(properties.operation).toBe('Applications');
  });

  it('reports a 5xx', async () => {
    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware(Object.assign(new Error('Server error'), { response: { status: 503 } }));

    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'graphql_request_failed', status: 503 }),
    );
  });

  it('stays quiet about a 4xx — that is the API working correctly', async () => {
    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware(Object.assign(new Error('Bad request'), { response: { status: 400 } }));

    expect(mockPosthog.captureException).not.toHaveBeenCalled();
  });

  it('stays quiet about a successful response', async () => {
    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;

    await middleware({ data: { applications: [] } });

    expect(mockPosthog.captureException).not.toHaveBeenCalled();
  });

  // The fingerprint of a COOKIE_DOMAIN or CORS_ORIGIN misconfiguration: the
  // hint cookie says signed in, the real HttpOnly cookies never arrive, and
  // the server sees nothing wrong at all.
  it('reports a failed refresh that happened while the session hint cookie was present', async () => {
    document.cookie = 'trakwyn_logged_in=1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: null } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;
    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'auth_session_hint_mismatch' }),
    );

    document.cookie = 'trakwyn_logged_in=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    fetchSpy.mockRestore();
  });

  it('stays quiet when the refresh fails with no hint cookie — an ordinary signed-out visitor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { refreshToken: null } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { gqlClient } = await loadInitialised();
    const middleware = (gqlClient as unknown as { responseMiddleware: Middleware })
      .responseMiddleware;
    await middleware({ errors: [{ extensions: { code: 'UNAUTHORIZED' } }] });

    expect(mockPosthog.captureException).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
