import { vi, type MockInstance } from 'vitest';
import { gqlClient, hasSessionCookie, traceHeaders } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import {
  LOGIN_MUTATION,
  REGISTER_MUTATION,
  SESSION_GATE_QUERY,
} from '#/features/auth/graphql/authQueries';
import { API_GRAPHQL_URL } from './support/apiProcess';

/**
 * The web client against a real API, with only the browser stubbed (a cookie
 * jar, `document.cookie`, `location`; see support/browserShim.ts). Every other
 * web suite replaces `gqlClient`, so nothing below Playwright checked that the
 * cookies the API sets are the ones the client relies on, or that the shared
 * refresh-and-retry and `endSession` work against a server that really answers
 * UNAUTHORIZED.
 */

const ACCESS = 'trakwyn_access_token';
const REFRESH = 'trakwyn_refresh_token';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

const shim = globalThis.__BROWSER_SHIM__!;

/** Requests to the API whose body is the refresh mutation. */
function refreshCalls(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(([, init]) => {
    const body = (init as RequestInit | undefined)?.body;
    return typeof body === 'string' && body.includes('refreshToken');
  }).length;
}

describe('web auth against a real API', () => {
  // A fresh account per run: the server may hold anything else.
  const email = `web-integration-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  let fetchSpy: MockInstance<typeof fetch>;

  const me = async () => (await gqlClient.request(SESSION_GATE_QUERY)) as { me: { email: string } };

  beforeAll(async () => {
    await gqlClient.request(REGISTER_MUTATION, { email, password: PASSWORD });
  });

  beforeEach(async () => {
    // Every test starts signed in, on a page that is not the marketing root.
    shim.reset();
    await gqlClient.request(LOGIN_MUTATION, { email, password: PASSWORD });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    queryClient.clear();
  });

  it('logs in, sets the hint cookie and answers an authenticated query', async () => {
    expect(shim.jar.has(ACCESS)).toBe(true);
    expect(shim.jar.has(REFRESH)).toBe(true);
    expect(hasSessionCookie()).toBe(true);
    // The tokens themselves are HttpOnly: page script must not see them.
    expect(document.cookie).not.toContain(ACCESS);
    expect(document.cookie).not.toContain(REFRESH);

    expect((await me()).me.email).toBe(email);
  });

  it('refreshes once and retries when the access cookie is gone', async () => {
    shim.jar.delete(ACCESS);

    // The request that met UNAUTHORIZED resolves: it was retried, not surfaced.
    expect((await me()).me.email).toBe(email);

    expect(refreshCalls(fetchSpy)).toBe(1);
    expect(shim.jar.has(ACCESS)).toBe(true);
    expect(shim.navigations).toEqual([]);
  });

  it('shares one refresh between concurrent UNAUTHORIZED requests', async () => {
    shim.jar.delete(ACCESS);

    const results = await Promise.all([me(), me(), me()]);

    expect(results.map((r) => r.me.email)).toEqual([email, email, email]);
    expect(refreshCalls(fetchSpy)).toBe(1);
  });

  it('ends the session when the refresh token is rejected', async () => {
    shim.jar.delete(ACCESS);
    shim.jar.set(REFRESH, 'not-a-real-refresh-token');

    await expect(me()).rejects.toThrow();

    expect(refreshCalls(fetchSpy)).toBe(1);
    // The hint is cleared (by the API's response or by `clearSessionHint`),
    // and the user is sent to /login carrying the page they were on.
    expect(hasSessionCookie()).toBe(false);
    expect(shim.navigations).toEqual([
      `/login?returnTo=${encodeURIComponent('/applications?status=open#top')}`,
    ]);
  });

  it('sends traceparent to the API origin and to nobody else', () => {
    expect(traceHeaders(API_GRAPHQL_URL).traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/,
    );
    expect(traceHeaders('https://blob.example.test/upload')).toEqual({});
  });

  it('actually sends traceparent on a request to the API', async () => {
    await me();

    const sent = fetchSpy.mock.calls.find(([input]) => String(input).startsWith(API_GRAPHQL_URL));
    const headers = new Headers((sent?.[1] as RequestInit | undefined)?.headers);
    expect(headers.get('traceparent')).toMatch(/^00-/);
  });
});
