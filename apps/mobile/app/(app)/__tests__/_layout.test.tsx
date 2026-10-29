import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../src/theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-router', () => {
  const { View } = require('react-native');
  const Stack = ({
    children,
    screenOptions,
  }: {
    children?: React.ReactNode;
    screenOptions?: { headerStyle?: { backgroundColor?: string }; headerTintColor?: string };
  }) => (
    <View
      testID="app-stack-root"
      headerBackgroundColor={screenOptions?.headerStyle?.backgroundColor}
      headerTintColor={screenOptions?.headerTintColor}
    >
      {children}
    </View>
  );
  Stack.Screen = ({ name, options }: { name: string; options?: { presentation?: string } }) => (
    <View
      testID={`screen-${name}`}
      {...(options?.presentation ? { accessibilityHint: options.presentation } : {})}
    />
  );
  return { Stack };
});

jest.mock('../../../src/features/verification/hooks/useEmailVerification', () => ({
  useEmailVerification: jest.fn(),
}));
jest.mock('../../../src/features/verification/screens/VerifyEmailRequiredScreen', () => ({
  VerifyEmailRequiredScreen: ({ email }: { email: string }) => {
    const { Text } = require('react-native');
    return <Text testID="verify-email-required">{email}</Text>;
  },
}));

jest.mock('../../../src/features/verification/screens/AccountDeletionScheduledScreen', () => ({
  AccountDeletionScheduledScreen: ({ deletionScheduledAt }: { deletionScheduledAt: string }) => {
    const { Text } = require('react-native');
    return <Text testID="account-deletion-scheduled">{deletionScheduledAt}</Text>;
  },
}));

import { useTheme } from '../../../src/theme/ThemeContext';
import { darkColors, lightColors } from '../../../src/theme/colors';
import { useEmailVerification } from '../../../src/features/verification/hooks/useEmailVerification';
import AppLayout from '../_layout';

const mockedUseTheme = jest.mocked(useTheme);
const mockedUseEmailVerification = jest.mocked(useEmailVerification);

const verification = (
  data:
    | { email: string; emailVerified: boolean; deletionScheduledAt?: string | null }
    | null
    | undefined,
) => mockedUseEmailVerification.mockReturnValue({ data } as never);

describe('AppLayout', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    verification({ email: 'a@b.c', emailVerified: true });
  });

  describe('email-verification gate (JEF-438)', () => {
    it('shows the reminder instead of the app for an unverified account', async () => {
      verification({ email: 'new@example.com', emailVerified: false });

      const { getByTestId, getByText, queryByTestId } = await render(<AppLayout />);

      expect(getByTestId('verify-email-required')).toBeTruthy();
      expect(getByText('new@example.com')).toBeTruthy();
      expect(queryByTestId('app-stack-root')).toBeNull();
    });

    it.each([
      ['a check still in flight', undefined],
      ['a check that failed or found no user', null],
    ])('renders the app for %s', async (_label, data) => {
      verification(data);

      const { getByTestId, queryByTestId } = await render(<AppLayout />);

      expect(getByTestId('app-stack-root')).toBeTruthy();
      expect(queryByTestId('verify-email-required')).toBeNull();
    });
  });

  it('shows only the cancel screen for an account scheduled for deletion (JEF-463)', async () => {
    verification({
      email: 'a@b.c',
      emailVerified: true,
      deletionScheduledAt: '2026-11-12T00:00:00.000Z',
    });

    const { getByTestId, queryByTestId } = await render(<AppLayout />);

    expect(getByTestId('account-deletion-scheduled')).toHaveTextContent('2026-11-12T00:00:00.000Z');
    expect(queryByTestId('app-stack-root')).toBeNull();
  });

  it('wraps the tab navigator and presents notifications as a modal outside any tab', async () => {
    const { getByTestId } = await render(<AppLayout />);

    expect(getByTestId('screen-(tabs)')).toBeTruthy();
    const notificationsScreen = getByTestId('screen-notifications');
    expect(notificationsScreen).toBeTruthy();
    expect(notificationsScreen.props.accessibilityHint).toBe('modal');
  });

  it("themes the notifications modal's header to match the current theme", async () => {
    mockedUseTheme.mockReturnValue({
      mode: 'dark',
      resolvedScheme: 'dark',
      colors: darkColors,
      setMode: jest.fn(),
    } as never);

    const { getByTestId } = await render(<AppLayout />);

    const root = getByTestId('app-stack-root');
    expect(root.props.headerBackgroundColor).toBe(darkColors.surface);
    expect(root.props.headerTintColor).toBe(darkColors.text);
  });
});
