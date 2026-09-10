import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../documents/hooks/useDocumentDraftQueries', () => ({
  useDocumentDrafts: jest.fn(),
}));
jest.mock('../../hooks/useCoverLetterMutations', () => ({ useGenerateCoverLetter: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(), useRouter: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDocumentDrafts } from '../../../documents/hooks/useDocumentDraftQueries';
import { useGenerateCoverLetter } from '../../hooks/useCoverLetterMutations';
import { CoverLetterScreen } from '../CoverLetterScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseDocumentDrafts = jest.mocked(useDocumentDrafts);
const mockedUseGenerateCoverLetter = jest.mocked(useGenerateCoverLetter);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen(push = jest.fn()) {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<CoverLetterScreen />);
}

describe('CoverLetterScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('shows saved cover letters filtered from document drafts', async () => {
    mockedUseDocumentDrafts.mockReturnValue({
      data: [
        {
          id: 'd1',
          applicationId: 'app-1',
          type: 'cover_letter',
          title: 'Acme Cover Letter',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'd2',
          applicationId: 'app-1',
          type: 'resume',
          title: 'Resume',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
    } as never);
    mockedUseGenerateCoverLetter.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByText, queryByText } = await renderScreen();

    await waitFor(() => expect(getByText('Acme Cover Letter')).toBeTruthy());
    expect(queryByText('Resume')).toBeNull();
  });

  it('shows the empty state when there are no saved cover letters', async () => {
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);
    mockedUseGenerateCoverLetter.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByText } = await renderScreen();

    expect(getByText('No cover letters saved yet.')).toBeTruthy();
  });

  it('generates a cover letter and navigates to its draft editor', async () => {
    const mutate = jest.fn((_resumeText, options) =>
      options?.onSuccess?.({
        id: 'd3',
        title: 'New Cover Letter',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);
    mockedUseGenerateCoverLetter.mockReturnValue({ mutate, isPending: false } as never);
    const push = jest.fn();

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('generate-cover-letter-button'));

    expect(mutate).toHaveBeenCalledWith(null, expect.any(Object));
    expect(push).toHaveBeenCalledWith('./documents/d3');
  });
});
