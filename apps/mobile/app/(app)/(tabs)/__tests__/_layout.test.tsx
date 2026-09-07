import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../../src/theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-router', () => {
  const { View } = require('react-native');
  const Tabs = ({
    children,
    screenOptions,
  }: {
    children?: React.ReactNode;
    screenOptions?: { headerShown?: boolean };
  }) => (
    <View testID="tabs-root" headerShown={screenOptions?.headerShown}>
      {children}
    </View>
  );
  Tabs.Screen = ({ options }: { options?: { tabBarButtonTestID?: string } }) => (
    <View testID={options?.tabBarButtonTestID} />
  );
  return { Tabs };
});

import { useTheme } from '../../../../src/theme/ThemeContext';
import { lightColors } from '../../../../src/theme/colors';
import TabsLayout from '../_layout';

const mockedUseTheme = jest.mocked(useTheme);

describe('TabsLayout', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('renders exactly the 5 tabs, each pointing at its own tab-group root', async () => {
    const { getByTestId } = await render(<TabsLayout />);

    expect(getByTestId('tab-home')).toBeTruthy();
    expect(getByTestId('tab-applications')).toBeTruthy();
    expect(getByTestId('tab-calendar')).toBeTruthy();
    expect(getByTestId('tab-assistant')).toBeTruthy();
    expect(getByTestId('tab-settings')).toBeTruthy();
  });

  it("hides the Tabs navigator's own header, so each tab's own themed Stack header is the only app bar", async () => {
    const { getByTestId } = await render(<TabsLayout />);

    expect(getByTestId('tabs-root').props.headerShown).toBe(false);
  });
});
