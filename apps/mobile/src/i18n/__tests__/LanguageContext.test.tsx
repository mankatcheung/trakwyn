import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { LanguageProvider, useLanguage } from '../LanguageContext';
import { getLanguageMode, setLanguageMode } from '../languageStorage';
import { detectDeviceLanguage } from '../detectDeviceLanguage';
import i18n from '../index';

jest.mock('../languageStorage', () => ({
  getLanguageMode: jest.fn(),
  setLanguageMode: jest.fn(),
}));

jest.mock('../detectDeviceLanguage', () => ({
  detectDeviceLanguage: jest.fn(),
}));

const mockedGetLanguageMode = jest.mocked(getLanguageMode);
const mockedSetLanguageMode = jest.mocked(setLanguageMode);
const mockedDetectDeviceLanguage = jest.mocked(detectDeviceLanguage);

function Probe() {
  const { mode, resolvedLanguage, setMode } = useLanguage();
  return (
    <>
      <Text testID="mode">{mode}</Text>
      <Text testID="resolved">{resolvedLanguage}</Text>
      <Text testID="set-zh-CN" onPress={() => setMode('zh-CN')}>
        set-zh-CN
      </Text>
    </>
  );
}

describe('LanguageContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetLanguageMode.mockResolvedValue(null);
    mockedDetectDeviceLanguage.mockReturnValue('en');
  });

  it('defaults to system mode resolved against the detected device language', async () => {
    mockedDetectDeviceLanguage.mockReturnValue('zh-CN');

    const { getByTestId } = await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    expect(getByTestId('resolved').props.children).toBe('zh-CN');
    await waitFor(() => expect(i18n.language).toBe('zh-CN'));
  });

  it('loads a persisted mode on mount, overriding device detection', async () => {
    mockedGetLanguageMode.mockResolvedValue('zh-CN');
    mockedDetectDeviceLanguage.mockReturnValue('en');

    const { getByTestId } = await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('zh-CN'));
    expect(getByTestId('resolved').props.children).toBe('zh-CN');
  });

  it('persists a mode change and switches i18next language', async () => {
    const { getByTestId } = await render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));

    await fireEvent.press(getByTestId('set-zh-CN'));

    await waitFor(() => expect(getByTestId('mode').props.children).toBe('zh-CN'));
    expect(mockedSetLanguageMode).toHaveBeenCalledWith('zh-CN');
    await waitFor(() => expect(i18n.language).toBe('zh-CN'));
  });

  it('throws when useLanguage is used outside a LanguageProvider', async () => {
    const Broken = () => {
      useLanguage();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<Broken />)).rejects.toThrow(
      'useLanguage must be used within a LanguageProvider',
    );

    consoleError.mockRestore();
  });
});
