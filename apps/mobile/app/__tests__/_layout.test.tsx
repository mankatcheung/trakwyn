import React from 'react';
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

describe('RootNavigator', () => {
  const replace = jest.fn();

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
  });

  it('shows a loading indicator while auth state is being restored', async () => {
    mockedUseAuth.mockReturnValue(authState({ isLoading: true }));

    const { getByTestId } = await render(<RootNavigator />);
    expect(getByTestId('root-loading')).toBeTruthy();
  });

  it('hides the loading indicator once auth state is known', async () => {
    mockedUseAuth.mockReturnValue(authState());

    const { queryByTestId } = await render(<RootNavigator />);
    expect(queryByTestId('root-loading')).toBeNull();
  });

  it('hides the loading indicator once authenticated', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    const { queryByTestId } = await render(<RootNavigator />);
    expect(queryByTestId('root-loading')).toBeNull();
  });

  describe('returning after a session expires', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('puts the user back where they were once they sign in again', async () => {
      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/applications/abc');
      const { rerender } = await render(<RootNavigator />);

      // The session dies underneath them: the guard drops them to (auth).
      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false, sessionExpired: true }));
      mockedUsePathname.mockReturnValue('/login');
      await rerender(<RootNavigator />);
      expect(replace).not.toHaveBeenCalled();

      // They sign back in; the (app) group mounts at its root.
      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/');
      await rerender(<RootNavigator />);
      act(() => {
        jest.runAllTimers();
      });

      expect(replace).toHaveBeenCalledWith('/applications/abc');
    });

    it('does nothing after a deliberate sign-out', async () => {
      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/applications/abc');
      const { rerender } = await render(<RootNavigator />);

      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false, sessionExpired: false }));
      mockedUsePathname.mockReturnValue('/login');
      await rerender(<RootNavigator />);

      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/');
      await rerender(<RootNavigator />);
      act(() => {
        jest.runAllTimers();
      });

      expect(replace).not.toHaveBeenCalled();
    });

    it('does not bother navigating back to the list root', async () => {
      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/');
      const { rerender } = await render(<RootNavigator />);

      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false, sessionExpired: true }));
      mockedUsePathname.mockReturnValue('/login');
      await rerender(<RootNavigator />);

      mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
      mockedUsePathname.mockReturnValue('/');
      await rerender(<RootNavigator />);
      act(() => {
        jest.runAllTimers();
      });

      expect(replace).not.toHaveBeenCalled();
    });
  });
});
