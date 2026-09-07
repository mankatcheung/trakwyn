import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({ useLanguage: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from '../../../../i18n/config';
import { LanguageScreen } from '../LanguageScreen';

const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLanguage = jest.mocked(useLanguage);

describe('LanguageScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({ colors: lightColors } as never);
  });

  it('selects a language mode', async () => {
    const setMode = jest.fn();
    mockedUseLanguage.mockReturnValue({
      mode: 'system',
      resolvedLanguage: 'en',
      supportedLanguages: SUPPORTED_LANGUAGES,
      setMode,
    });

    const { getByTestId } = await render(<LanguageScreen />);

    await fireEvent.press(getByTestId('language-zh-CN'));
    expect(setMode).toHaveBeenCalledWith('zh-CN');

    await fireEvent.press(getByTestId('language-en'));
    expect(setMode).toHaveBeenCalledWith('en');

    await fireEvent.press(getByTestId('language-system'));
    expect(setMode).toHaveBeenCalledWith('system');
  });

  it('renders the system option plus every supported language', async () => {
    mockedUseLanguage.mockReturnValue({
      mode: 'en',
      resolvedLanguage: 'en',
      supportedLanguages: SUPPORTED_LANGUAGES,
      setMode: jest.fn(),
    });

    const { getByTestId } = await render(<LanguageScreen />);

    expect(getByTestId('language-system')).toBeTruthy();
    expect(getByTestId('language-en')).toBeTruthy();
    expect(getByTestId('language-en-GB')).toBeTruthy();
    expect(getByTestId('language-zh-HK')).toBeTruthy();
    expect(getByTestId('language-zh-TW')).toBeTruthy();
    expect(getByTestId('language-zh-CN')).toBeTruthy();
  });
});
