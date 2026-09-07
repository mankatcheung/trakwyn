import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../i18n';

jest.mock('../tokenStorage', () => ({
  getTokens: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

jest.mock('../../graphql/client', () => ({
  gqlRequest: jest.fn(),
  getValidAccessToken: jest.fn(),
  setAccessToken: jest.fn(),
  onSessionExpired: jest.fn(() => () => {}),
}));

import { getTokens, setTokens, clearTokens } from '../tokenStorage';
import {
  gqlRequest,
  getValidAccessToken,
  setAccessToken,
  onSessionExpired,
} from '../../graphql/client';
import { AuthProvider, useAuth } from '../AuthContext';
import { RESTORE_REFRESH_WAIT_MS } from '../../constants';

const mockedGetTokens = jest.mocked(getTokens);
const mockedSetTokens = jest.mocked(setTokens);
const mockedClearTokens = jest.mocked(clearTokens);
const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedGetValidAccessToken = jest.mocked(getValidAccessToken);
const mockedSetAccessToken = jest.mocked(setAccessToken);
const mockedOnSessionExpired = jest.mocked(onSessionExpired);

const storedPair = { accessToken: 'stored-access', refreshToken: 'stored-refresh' };

let queryClient: QueryClient;
let clearCache: jest.SpyInstance;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

async function renderAuth() {
  const rendered = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    clearCache = jest.spyOn(queryClient, 'clear');
    mockedOnSessionExpired.mockReturnValue(() => {});
    mockedGetValidAccessToken.mockResolvedValue('fresh-access');
    mockedSetTokens.mockResolvedValue(undefined);
    mockedClearTokens.mockResolvedValue(undefined);
  });

  describe('restoring on launch', () => {
    it('starts unauthenticated when no tokens are stored', async () => {
      mockedGetTokens.mockResolvedValueOnce(null);

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockedGetValidAccessToken).not.toHaveBeenCalled();
    });

    it('restores the stored access token and refreshes it proactively', async () => {
      mockedGetTokens.mockResolvedValueOnce(storedPair);

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(true);
      expect(mockedSetAccessToken).toHaveBeenCalledWith('stored-access');
      expect(mockedGetValidAccessToken).toHaveBeenCalledTimes(1);
    });

    it('starts unauthenticated when the stored session is rejected by the server', async () => {
      mockedGetTokens.mockResolvedValueOnce(storedPair);
      mockedGetValidAccessToken.mockResolvedValueOnce(null);

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(false);
    });

    it('stays signed in when the proactive refresh cannot reach the server', async () => {
      mockedGetTokens.mockResolvedValueOnce(storedPair);
      mockedGetValidAccessToken.mockResolvedValueOnce('stored-access'); // the stale token, unchanged

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('opens the app after the bounded wait if the proactive refresh hangs', async () => {
      jest.useFakeTimers();
      try {
        mockedGetTokens.mockResolvedValueOnce(storedPair);
        mockedGetValidAccessToken.mockReturnValueOnce(new Promise(() => {})); // never settles

        const { result } = await renderHook(() => useAuth(), { wrapper });
        await act(async () => {}); // let getTokens() resolve and the wait begin
        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          jest.advanceTimersByTime(RESTORE_REFRESH_WAIT_MS);
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isAuthenticated).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    // expo-secure-store can throw on read (Android keystore failures); the
    // old restore had no catch, which left the app on its launch spinner forever.
    it('starts clean instead of hanging when the stored pair cannot be read', async () => {
      mockedGetTokens.mockRejectedValueOnce(new Error('Could not decrypt the value'));

      const { result } = await renderAuth();

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockedClearTokens).toHaveBeenCalled();
    });
  });

  it('logs in, stores the returned tokens, and starts from an empty cache', async () => {
    mockedGetTokens.mockResolvedValueOnce(null);
    mockedGqlRequest.mockResolvedValueOnce({
      loginMobile: {
        success: true,
        totpRequired: false,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      },
    });

    const { result } = await renderAuth();

    let outcome: { totpRequired: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.login('a@example.com', 'password123');
    });

    expect(outcome).toEqual({ totpRequired: false });
    expect(mockedSetTokens).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(clearCache).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('reports totpRequired without storing tokens when TOTP is required', async () => {
    mockedGetTokens.mockResolvedValueOnce(null);
    mockedGqlRequest.mockResolvedValueOnce({
      loginMobile: { success: false, totpRequired: true, accessToken: null, refreshToken: null },
    });

    const { result } = await renderAuth();

    let outcome: { totpRequired: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.login('a@example.com', 'password123');
    });

    expect(outcome).toEqual({ totpRequired: true });
    expect(mockedSetTokens).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('clears the tokens and the query cache and flips to unauthenticated on logout', async () => {
    mockedGetTokens.mockResolvedValueOnce(storedPair);
    mockedGqlRequest.mockResolvedValueOnce({ logout: true });

    const { result } = await renderAuth();
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(mockedClearTokens).toHaveBeenCalled();
    expect(mockedSetAccessToken).toHaveBeenCalledWith(null);
    // Nothing this account loaded may survive into the next sign-in.
    expect(clearCache).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionExpired).toBe(false);
  });

  it('drops the session, marks it expired, and clears the cache when the client reports expiry', async () => {
    let expire: (() => void) | undefined;
    mockedOnSessionExpired.mockImplementation((listener) => {
      expire = listener;
      return () => {};
    });
    mockedGetTokens.mockResolvedValueOnce(storedPair);

    const { result } = await renderAuth();
    expect(result.current.isAuthenticated).toBe(true);

    expect(expire).toBeDefined();
    await act(async () => {
      expire?.();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionExpired).toBe(true);
    expect(clearCache).toHaveBeenCalled();
  });

  describe('reauthenticate', () => {
    it('re-signs the current session with a fresh pair and keeps the cache', async () => {
      mockedGetTokens.mockResolvedValueOnce(storedPair);
      mockedGqlRequest.mockResolvedValueOnce({
        reauthenticateMobile: {
          success: true,
          totpRequired: false,
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
        },
      });

      const { result } = await renderAuth();
      clearCache.mockClear();

      let outcome: { totpRequired: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.reauthenticate('password123');
      });

      expect(outcome).toEqual({ totpRequired: false });
      // A wrong password here is UNAUTHORIZED too — never a reason to refresh and replay.
      expect(mockedGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('reauthenticateMobile'),
        { password: 'password123', code: null },
        { refreshOnUnauthorized: false },
      );
      expect(mockedSetTokens).toHaveBeenCalledWith({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
      });
      expect(mockedSetAccessToken).toHaveBeenCalledWith('access-2');
      expect(clearCache).not.toHaveBeenCalled();
    });

    it('reports totpRequired and stores nothing until the code is supplied', async () => {
      mockedGetTokens.mockResolvedValueOnce(storedPair);
      mockedGqlRequest.mockResolvedValueOnce({
        reauthenticateMobile: {
          success: false,
          totpRequired: true,
          accessToken: null,
          refreshToken: null,
        },
      });

      const { result } = await renderAuth();

      let outcome: { totpRequired: boolean } | undefined;
      await act(async () => {
        outcome = await result.current.reauthenticate('password123', '123456');
      });

      expect(outcome).toEqual({ totpRequired: true });
      expect(mockedGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('reauthenticateMobile'),
        { password: 'password123', code: '123456' },
        { refreshOnUnauthorized: false },
      );
      expect(mockedSetTokens).not.toHaveBeenCalled();
    });
  });
});
