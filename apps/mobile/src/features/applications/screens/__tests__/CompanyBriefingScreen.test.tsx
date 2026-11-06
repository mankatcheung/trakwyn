import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useCompanyBriefingQueries', () => ({ useCompanyBriefing: jest.fn() }));
jest.mock('../../hooks/useCompanyBriefingMutations', () => ({
  useGenerateCompanyBriefing: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import {
  exhaustedCredits,
  ownKeyCredits,
  trakwynCredits,
} from '../../../ai/testing/aiCreditsFixture';
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
    jest.mocked(useAiCredits).mockReturnValue(ownKeyCredits());
  });

  it('generates a briefing directly when none exists yet', async () => {
    const mutate = jest.fn();
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('generate-company-briefing-button'));

    expect(mutate).toHaveBeenCalled();
    // An empty prompt is sent as an empty string; the hook turns it into null.
    expect(mutate.mock.calls[0][0]).toBe('');
  });

  it('sends the instructions typed into the prompt box', async () => {
    const mutate = jest.fn();
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(
      getByTestId('company-briefing-prompt-input'),
      'Focus on remote culture and funding stability',
    );
    await fireEvent.press(getByTestId('generate-company-briefing-button'));

    expect(mutate.mock.calls[0][0]).toBe('Focus on remote culture and funding stability');
  });

  it('shows the cost and credits left on Trakwyn AI', async () => {
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());

    const { getByText, getByTestId } = await renderScreen();

    expect(getByText('Uses 4 credits')).toBeTruthy();
    expect(getByTestId('ai-credits-inline')).toBeTruthy();
  });

  it('shows no cost or credits line on the userʼs own key', async () => {
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);

    const { queryByText, queryByTestId } = await renderScreen();

    expect(queryByText(/Uses \d+ credit/)).toBeNull();
    expect(queryByTestId('ai-credits-inline')).toBeNull();
  });

  it('disables generating once the credits are spent', async () => {
    const mutate = jest.fn();
    mockedUseCompanyBriefing.mockReturnValue({ data: null, isLoading: false } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({ mutate, isPending: false } as never);
    jest.mocked(useAiCredits).mockReturnValue(exhaustedCredits());

    const { getByTestId, getByText } = await renderScreen();
    await fireEvent.press(getByTestId('generate-company-briefing-button'));

    expect(mutate).not.toHaveBeenCalled();
    expect(getByText('You are out of AI credits this month.')).toBeTruthy();
  });

  it('renders the briefing as markdown, not raw syntax', async () => {
    mockedUseCompanyBriefing.mockReturnValue({
      data: {
        id: 'b1',
        applicationId: 'app-1',
        content: '## Culture signals\n\n- **Fast** pace\n- Flat hierarchy',
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      isLoading: false,
    } as never);
    mockedUseGenerateCompanyBriefing.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);

    const { getByText, queryByText } = await renderScreen();

    expect(getByText('Culture signals')).toBeTruthy();
    expect(getByText('Fast')).toBeTruthy();
    expect(getByText(/Flat hierarchy/)).toBeTruthy();
    expect(queryByText(/##/)).toBeNull();
    expect(queryByText(/\*\*/)).toBeNull();
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
