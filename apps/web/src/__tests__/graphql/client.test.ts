import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
}));

type Middleware = (response: unknown) => Promise<void>;

// GraphQLClient must be a real constructor (not an arrow fn) to support `new`
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn(function (
    this: { responseMiddleware: Middleware },
    _url: string,
    opts: { responseMiddleware?: Middleware },
  ) {
    this.responseMiddleware = opts?.responseMiddleware ?? (() => Promise.resolve());
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
