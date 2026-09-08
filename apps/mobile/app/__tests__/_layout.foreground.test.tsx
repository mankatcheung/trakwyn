import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: React.ReactNode }) => children;
  Stack.Screen = () => null;
  Stack.Protected = ({ guard, children }: { guard: boolean; children?: React.ReactNode }) =>
    guard ? children : null;
  return { Stack, useRouter: jest.fn(), usePathname: jest.fn() };
});

import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { RootNavigator } from '../_layout';
import { useTheme } from '../../src/theme/ThemeContext';
import { lightColors } from '../../src/theme/colors';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUsePathname = jest.mocked(usePathname);
const mockedUseTheme = jest.mocked(useTheme);

type AuthState = ReturnType<typeof useAuth>;

function authState(overrides: Partial<AuthState> = {}): AuthState {
  return {
    isLoading: false,
    isAuthenticated: false,
    sessionExpired: false,
    login: jest.fn(),
    loginWithTotp: jest.fn(),
    loginWithOAuth: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    reauthenticate: jest.fn(),
    ...overrides,
  };
}

describe('RootNavigator returning to the foreground', () => {
  const replace = jest.fn();
  let changeListener: ((state: 'active' | 'background' | 'inactive') => void) | undefined;
  let originalAddEventListener: typeof AppState.addEventListener;

  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue({ replace } as never);
    mockedUsePathname.mockReturnValue('/');

    changeListener = undefined;
    originalAddEventListener = AppState.addEventListener;
    AppState.addEventListener = ((event: string, listener: never) => {
      if (event === 'change') changeListener = listener;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener;
  });

  afterEach(() => {
    AppState.addEventListener = originalAddEventListener;
  });

  function emitAppStateChange(nextState: 'active' | 'background' | 'inactive') {
    changeListener?.(nextState);
  }

  it('resets to the dashboard tab when the app resumes from the background', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
    mockedUsePathname.mockReturnValue('/conversations');
    await render(<RootNavigator />);

    act(() => {
      emitAppStateChange('background');
      emitAppStateChange('active');
    });

    expect(replace).toHaveBeenCalledWith('/(tabs)/(home)');
  });

  it('does nothing while merely transitioning to inactive (e.g. a system dialog)', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
    mockedUsePathname.mockReturnValue('/conversations');
    await render(<RootNavigator />);

    act(() => {
      emitAppStateChange('inactive');
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it('does not reset the tab when the app resumes while signed out', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));
    mockedUsePathname.mockReturnValue('/login');
    await render(<RootNavigator />);

    act(() => {
      emitAppStateChange('background');
      emitAppStateChange('active');
    });

    expect(replace).not.toHaveBeenCalled();
  });
});
