import React from 'react';
import * as ReactNative from 'react-native';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { getThemeMode, setThemeMode } from '../themeStorage';
import { darkColors, lightColors } from '../colors';

jest.mock('../themeStorage', () => ({
  getThemeMode: jest.fn(),
  setThemeMode: jest.fn(),
}));

const mockedGetThemeMode = jest.mocked(getThemeMode);
const mockedSetThemeMode = jest.mocked(setThemeMode);
const mockedUseColorScheme = jest.spyOn(ReactNative, 'useColorScheme');

function Probe() {
  const { mode, resolvedScheme, colors, setMode } = useTheme();
  return (
    <>
      <Text testID="mode">{mode}</Text>
      <Text testID="resolved">{resolvedScheme}</Text>
      <Text testID="background">{colors.background}</Text>
      <Text testID="set-dark" onPress={() => setMode('dark')}>
        set-dark
      </Text>
    </>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetThemeMode.mockResolvedValue(null);
    mockedUseColorScheme.mockReturnValue('light');
  });

  it('defaults to system mode resolved against the OS scheme', async () => {
    mockedUseColorScheme.mockReturnValue('dark');

    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    expect(getByTestId('resolved').props.children).toBe('dark');
    expect(getByTestId('background').props.children).toBe(darkColors.background);
  });

  it('loads a persisted mode on mount, overriding the system default', async () => {
    mockedGetThemeMode.mockResolvedValue('dark');
    mockedUseColorScheme.mockReturnValue('light');

    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('dark'));
    expect(getByTestId('resolved').props.children).toBe('dark');
    expect(getByTestId('background').props.children).toBe(darkColors.background);
  });

  it('persists a mode change and resolves colors from it', async () => {
    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));

    await fireEvent.press(getByTestId('set-dark'));

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('dark'));
    expect(getByTestId('background').props.children).toBe(darkColors.background);
    expect(mockedSetThemeMode).toHaveBeenCalledWith('dark');
  });

  it('resolves light colors for light mode', async () => {
    mockedGetThemeMode.mockResolvedValue('light');
    mockedUseColorScheme.mockReturnValue('dark');

    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('light'));
    expect(getByTestId('background').props.children).toBe(lightColors.background);
  });

  it('throws when useTheme is used outside a ThemeProvider', async () => {
    const Broken = () => {
      useTheme();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Broken />)).rejects.toThrow(
      'useTheme must be used within a ThemeProvider',
    );

    consoleError.mockRestore();
  });
});
