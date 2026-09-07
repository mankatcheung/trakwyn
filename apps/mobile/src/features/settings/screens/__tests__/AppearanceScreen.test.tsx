import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { AppearanceScreen } from '../AppearanceScreen';

const mockedUseTheme = jest.mocked(useTheme);

describe('AppearanceScreen', () => {
  it('selects a theme mode', async () => {
    const setMode = jest.fn();
    mockedUseTheme.mockReturnValue({
      mode: 'system',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode,
    } as never);

    const { getByTestId } = await render(<AppearanceScreen />);

    await fireEvent.press(getByTestId('appearance-dark'));
    expect(setMode).toHaveBeenCalledWith('dark');

    await fireEvent.press(getByTestId('appearance-light'));
    expect(setMode).toHaveBeenCalledWith('light');

    await fireEvent.press(getByTestId('appearance-system'));
    expect(setMode).toHaveBeenCalledWith('system');
  });

  it('renders all three options with the current mode present', async () => {
    mockedUseTheme.mockReturnValue({
      mode: 'dark',
      resolvedScheme: 'dark',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);

    const { getByTestId } = await render(<AppearanceScreen />);

    expect(getByTestId('appearance-light')).toBeTruthy();
    expect(getByTestId('appearance-dark')).toBeTruthy();
    expect(getByTestId('appearance-system')).toBeTruthy();
  });

  it('stacks the options vertically, each spanning the full device width', async () => {
    mockedUseTheme.mockReturnValue({
      mode: 'system',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);

    const { getByTestId } = await render(<AppearanceScreen />);

    const list = getByTestId('appearance-light').parent;
    expect(list?.props.style).not.toContainEqual(expect.objectContaining({ flexDirection: 'row' }));
    expect(getByTestId('appearance-light').props.style).toContainEqual(
      expect.objectContaining({ alignSelf: 'stretch' }),
    );
  });
});
