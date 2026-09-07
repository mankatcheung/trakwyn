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

import { useTheme } from '../../../src/theme/ThemeContext';
import { darkColors, lightColors } from '../../../src/theme/colors';
import AppLayout from '../_layout';

const mockedUseTheme = jest.mocked(useTheme);

describe('AppLayout', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
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
