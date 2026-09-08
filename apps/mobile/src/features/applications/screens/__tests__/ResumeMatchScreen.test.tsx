import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../documents/hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useResumeMatchMutations', () => ({ useComputeResumeMatchScore: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useDocuments } from '../../../documents/hooks/useDocumentQueries';
import { useComputeResumeMatchScore } from '../../hooks/useResumeMatchMutations';
import { ResumeMatchScreen } from '../ResumeMatchScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseDocuments = jest.mocked(useDocuments);
const mockedUseComputeResumeMatchScore = jest.mocked(useComputeResumeMatchScore);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<ResumeMatchScreen />);
}

describe('ResumeMatchScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseDocuments.mockReturnValue({ data: [] } as never);
  });

  it('lets the user paste resume text and check the match when no resume is uploaded', async () => {
    const mutate = jest.fn();
    mockedUseComputeResumeMatchScore.mockReturnValue({
      mutate,
      isPending: false,
      data: undefined,
    } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('resume-match-input'), 'My resume text');
    await fireEvent.press(getByTestId('compute-resume-match-button'));

    expect(mutate).toHaveBeenCalledWith('My resume text', expect.any(Object));
  });

  it('uses the uploaded resume by default when one exists', async () => {
    mockedUseDocuments.mockReturnValue({
      data: [
        {
          id: 'doc1',
          applicationId: 'app-1',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          url: 'https://example.com/resume.pdf',
          documentType: 'resume',
          version: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as never);
    const mutate = jest.fn();
    mockedUseComputeResumeMatchScore.mockReturnValue({
      mutate,
      isPending: false,
      data: undefined,
    } as never);

    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText(/resume.pdf/)).toBeTruthy());

    await fireEvent.press(getByTestId('compute-resume-match-button'));

    expect(mutate).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it('renders the match result once computed', async () => {
    mockedUseComputeResumeMatchScore.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      data: {
        score: 78,
        label: 'Good match',
        matchedKeywords: ['React'],
        missingKeywords: ['GraphQL'],
        summary: 'Solid overlap.',
      },
    } as never);

    const { getByText, getByTestId } = await renderScreen();

    expect(getByTestId('resume-match-result')).toBeTruthy();
    expect(getByText('78')).toBeTruthy();
    expect(getByText('React')).toBeTruthy();
    expect(getByText('GraphQL')).toBeTruthy();
  });
});
