import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useCompanyBriefingQueries', () => ({ useCompanyBriefing: jest.fn() }));
jest.mock('../../hooks/useCompanyBriefingMutations', () => ({
  useGenerateCompanyBriefing: jest.fn(),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useCompanyBriefing } from '../../hooks/useCompanyBriefingQueries';
import { useGenerateCompanyBriefing } from '../../hooks/useCompanyBriefingMutations';
import { CompanyBriefingScreen } from '../CompanyBriefingScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseCompanyBriefing = jest.mocked(useCompanyBriefing);
const mockedUseGenerateCompanyBriefing = jest.mocked(useGenerateCompanyBriefing);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<CompanyBriefingScreen />);
}

describe('CompanyBriefingScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('generates a briefing directly when none exists yet', async () => {
    const mutate = jest.fn();
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('generate-company-briefing-button'));

    expect(mutate).toHaveBeenCalled();
  });

  it('confirms before regenerating an existing briefing', async () => {
    const mutate = jest.fn();
    mockedUseCompanyBriefing.mockReturnValue({
      data: {
        id: 'b1',
        applicationId: 'app-1',
        content: 'Existing briefing content.',
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      isLoading: false,
    } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({ mutate, isPending: false } as never);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Regenerate');
      confirm?.onPress?.();
    });

    const { getByText, getByTestId } = await renderScreen();

    expect(getByText('Existing briefing content.')).toBeTruthy();

    await fireEvent.press(getByTestId('generate-company-briefing-button'));

    expect(mutate).toHaveBeenCalled();
  });
});
