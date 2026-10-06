import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientError } from 'graphql-request';
import '../i18n';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { getTokens } from '../auth/tokenStorage';
import { getAccessToken, getValidAccessToken, gqlRequest, setAccessToken } from '../graphql/client';
import { getErrorCode } from '../lib/errors';
import { PROFILE_QUERY, SESSIONS_QUERY } from '../features/settings/graphql/operations';

/**
 * Closes JEF-300's G-5: every other suite that touches the transport replaces
 * it. client.test.ts spies on GraphQLClient.prototype.request and 23 more mock
 * graphql/client outright, so nothing asserts that a real request is ever
 * assembled correctly — the authorization header, the User-Agent the API turns
 * into a session label, and the refresh-and-retry path are all proven against
 * doubles that agree with the code by construction.
 *
 * Here nothing below the app is mocked except the keychain: one account is
 * registered through the real AuthProvider against the real API, and the rest
 * of the file asserts what that round trip actually produced.
 */

const PASSWORD = 'CorrectHorseBatteryStaple1!';

/** A JWT the client can read `exp` out of. Unsigned — the API rejects it, which is the point. */
function jwtExpiringIn(seconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.signature`;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('mobile auth against a real API', () => {
  // A fresh account per run: these suites share one server with whatever else
  // is on it, so nothing here may depend on seeded state (JEF-300, R-3).
  const email = `integration-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

  beforeAll(async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.register(email, PASSWORD);
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
  });

  it('stores the pair the API issued as a single value', async () => {
    const tokens = await getTokens();
    expect(tokens).not.toBeNull();
    expect(tokens?.accessToken).toEqual(expect.any(String));
    expect(tokens?.refreshToken).toEqual(expect.any(String));
  });

  it('sends the access token on an authenticated query', async () => {
    const data = await gqlRequest<{ me: { email: string } }>(PROFILE_QUERY);

    expect(data.me.email).toBe(email);
  });

  it('sends a User-Agent the API recognises as the mobile app', async () => {
    // buildUserAgent() is only ever asserted against itself in unit tests.
    // This is the assertion that the header survives graphql-request, reaches
    // Fastify, and is parsed by DeviceLabelService into the label the sessions
    // screen shows — "Unknown device" here means the header never arrived.
    const data = await gqlRequest<{ sessions: { deviceLabel: string; current: boolean }[] }>(
      SESSIONS_QUERY,
    );

    const current = data.sessions.find((session) => session.current);
    expect(current?.deviceLabel).toContain('Trakwyn app');
  });

  it('refreshes and retries when the API rejects the token it was sent', async () => {
    const stale = jwtExpiringIn(3600);
    setAccessToken(stale);

    // Unexpired as far as the client can tell, so it is sent as-is and comes
    // back UNAUTHORIZED — the reactive half of the refresh path, which only a
    // real server's rejection can trigger.
    const data = await gqlRequest<{ me: { email: string } }>(PROFILE_QUERY);

    expect(data.me.email).toBe(email);
    expect(getAccessToken()).not.toBe(stale);
  });

  it('refreshes before sending a token that is about to expire', async () => {
    const expired = jwtExpiringIn(-60);
    setAccessToken(expired);

    const token = await getValidAccessToken();

    expect(token).not.toBeNull();
    expect(token).not.toBe(expired);
  });

  it('surfaces the API error code the app branches on', async () => {
    // getErrorCode is what every screen reads to tell a conflict from a
    // network failure; this proves it reads a real Mercurius error envelope
    // and not just the shape the unit tests hand it.
    const duplicate = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(duplicate.result.current.isLoading).toBe(false));

    const error = await duplicate.result.current
      .register(email, PASSWORD)
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ClientError);
    expect(getErrorCode(error)).toBe('CONFLICT');
  });
});
