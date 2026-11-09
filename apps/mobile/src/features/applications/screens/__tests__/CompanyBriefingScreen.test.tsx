import React from 'react';
import { Alert, Linking } from 'react-native';
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

  describe('sources (JEF-475)', () => {
    const briefingWith = (
      sources: { url: string; title: string; publishedAt?: string | null }[] | undefined,
    ) =>
      mockedUseCompanyBriefing.mockReturnValue({
        data: {
          id: 'b1',
          applicationId: 'app-1',
          content: 'Acme sells payroll software [1].',
          sources,
          generatedAt: '2026-01-01T00:00:00.000Z',
        },
        isLoading: false,
      } as never);

    beforeEach(() => {
      mockedUseGenerateCompanyBriefing.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      } as never);
    });

    it('lists the pages the briefing was written from, numbered to match its citations', async () => {
      briefingWith([
        { url: 'https://acme.com', title: 'Acme | Payroll' },
        { url: 'https://acme.com/about', title: 'About Acme' },
      ]);

      const { getByText, getByTestId } = await renderScreen();

      expect(getByTestId('company-briefing-sources')).toBeTruthy();
      expect(getByText('Sources')).toBeTruthy();
      expect(getByText('[1] Acme | Payroll')).toBeTruthy();
      expect(getByText('[2] About Acme')).toBeTruthy();
    });

    it('shows when a web search source was published, and nothing for one with no date', async () => {
      const published = '2026-03-12T00:00:00.000Z';
      briefingWith([
        { url: 'https://acme.com', title: 'Acme | Payroll', publishedAt: null },
        { url: 'https://news.example/acme', title: 'Acme raises Series B', publishedAt: published },
        { url: 'https://reviews.example/acme', title: 'Acme reviews' },
      ]);

      const { getByTestId } = await renderScreen();
      const rendered = (id: string) => JSON.stringify(getByTestId(id).children);

      expect(rendered('company-briefing-source-2')).toContain(
        new Date(published).toLocaleDateString(),
      );
      expect(rendered('company-briefing-source-1')).not.toContain(' · ');
      expect(rendered('company-briefing-source-3')).not.toContain(' · ');
    });

    it('opens a source in the browser', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      briefingWith([{ url: 'https://acme.com', title: 'Acme | Payroll' }]);

      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('company-briefing-source-1'));

      expect(openURL).toHaveBeenCalledWith('https://acme.com');
    });

    it('does not open a stored value that is not a web address', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      briefingWith([{ url: 'javascript:alert(1)', title: 'Sneaky' }]);

      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('company-briefing-source-1'));

      expect(openURL).not.toHaveBeenCalled();
    });

    it.each([[[]], [undefined]])('shows no sources section for %j', async (sources) => {
      briefingWith(sources);

      const { queryByTestId, getByText } = await renderScreen();

      expect(getByText(/Acme sells payroll software/)).toBeTruthy();
      expect(queryByTestId('company-briefing-sources')).toBeNull();
    });
  });
});
