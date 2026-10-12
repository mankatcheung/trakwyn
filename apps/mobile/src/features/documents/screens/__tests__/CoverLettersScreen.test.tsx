import React from 'react';
import { render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../hooks/useDocumentQueries', () => ({ useDocuments: jest.fn() }));
jest.mock('../../hooks/useDeleteDocument', () => ({ useDeleteDocument: jest.fn() }));
jest.mock('../../hooks/useUploadDocument', () => ({ useUploadDocument: jest.fn() }));
jest.mock('../../hooks/useDocumentDraftQueries', () => ({ useDocumentDrafts: jest.fn() }));
jest.mock('expo-router', () => {
  const { View } = require('react-native');
  return {
    useLocalSearchParams: jest.fn(),
    useRouter: jest.fn(),
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
  };
});
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useDeleteDocument } from '../../hooks/useDeleteDocument';
import { useUploadDocument } from '../../hooks/useUploadDocument';
import { useDocumentDrafts } from '../../hooks/useDocumentDraftQueries';
import { CoverLettersScreen } from '../CoverLettersScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const draft = (id: string, title: string, type: string) => ({
  id,
  applicationId: 'app-1',
  type,
  title,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('CoverLettersScreen', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'app-1' } as never);
    jest.mocked(useRouter).mockReturnValue({ push } as never);
    jest
      .mocked(useDocuments)
      .mockReturnValue({ data: [], isLoading: false, isError: false, error: null } as never);
    jest.mocked(useDeleteDocument).mockReturnValue({ mutate: jest.fn() } as never);
    jest
      .mocked(useUploadDocument)
      .mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    jest.mocked(useDocumentDrafts).mockReturnValue({ data: [], isLoading: false } as never);
  });

  it('lists saved cover letters and leaves resume drafts to the Resumes screen', async () => {
    jest.mocked(useDocumentDrafts).mockReturnValue({
      data: [draft('d1', 'Acme Cover Letter', 'cover_letter'), draft('d2', 'My Resume', 'resume')],
      isLoading: false,
    } as never);

    const { getByText, queryByText } = await render(<CoverLettersScreen />);

    expect(getByText('Acme Cover Letter')).toBeTruthy();
    expect(queryByText('My Resume')).toBeNull();
  });

  it('shows the empty state when there are no cover letters', async () => {
    const { getByText } = await render(<CoverLettersScreen />);

    expect(getByText('No cover letters yet.')).toBeTruthy();
  });

  it('does not generate here: generation lives on the create screen, like resumes', async () => {
    const { queryByTestId } = await render(<CoverLettersScreen />);

    expect(queryByTestId('generate-cover-letter-button')).toBeNull();
    expect(queryByTestId('cover-letter-resume-input')).toBeNull();
  });
});
