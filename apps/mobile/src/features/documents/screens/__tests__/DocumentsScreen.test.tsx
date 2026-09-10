import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
    // `asChild` composition isn't exercised here, but unlike a bare
    // passthrough, wrapping in a testID-tagged View still lets tests assert
    // the resolved `href` — a relative href resolves against the wrong
    // directory from an index route, which a passthrough mock can't catch.
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
  };
});

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useDeleteDocument } from '../../hooks/useDeleteDocument';
import { useUploadDocument } from '../../hooks/useUploadDocument';
import { useDocumentDrafts } from '../../hooks/useDocumentDraftQueries';
import { DocumentsScreen } from '../DocumentsScreen';
import type { Document } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);
const mockedUseDocuments = jest.mocked(useDocuments);
const mockedUseDeleteDocument = jest.mocked(useDeleteDocument);
const mockedUseUploadDocument = jest.mocked(useUploadDocument);
const mockedUseDocumentDrafts = jest.mocked(useDocumentDrafts);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const document: Document = {
  id: '1',
  applicationId: 'app-1',
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  url: 'https://example.com/resume.pdf',
  documentType: 'resume',
  version: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<DocumentsScreen />);
}

describe('DocumentsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseDeleteDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);
  });

  it('renders existing documents', async () => {
    mockedUseDocuments.mockReturnValue({
      data: [document],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('resume.pdf')).toBeTruthy());
  });

  it('picks a file and uploads it with the selected type', async () => {
    const mutate = jest.fn();
    mockedUseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate, isPending: false } as never);
    mockedGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///tmp/resume.pdf',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          lastModified: 0,
        },
      ],
    });

    const { getByTestId, findByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('pick-document-button'));
    const resumeChip = await findByTestId('document-type-resume');
    await fireEvent.press(resumeChip);
    await fireEvent.press(getByTestId('confirm-upload-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///tmp/resume.pdf',
        name: 'resume.pdf',
        documentType: 'resume',
      }),
      expect.any(Object),
    );
  });

  it('deletes a document after confirmation', async () => {
    const deleteMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete');
      confirm?.onPress?.();
    });
    mockedUseDocuments.mockReturnValue({
      data: [document],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteDocument.mockReturnValue({ mutate: deleteMutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('delete-document-1'));

    expect(deleteMutate).toHaveBeenCalledWith('1', expect.any(Object));
  });

  it('renders document drafts with their type and a new-draft entry point', async () => {
    mockedUseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDocumentDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          applicationId: 'app-1',
          type: 'cover_letter',
          title: 'Cover Letter — Acme Corp',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
    } as never);

    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText('Cover Letter — Acme Corp')).toBeTruthy());
    expect(getByTestId('draft-draft-1')).toBeTruthy();
    expect(getByTestId('new-draft-button')).toBeTruthy();
  });

  it('resolves draft and new-draft links against the documents/ subroute', async () => {
    mockedUseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDocumentDrafts.mockReturnValue({
      data: [
        {
          id: 'draft-1',
          applicationId: 'app-1',
          type: 'resume',
          title: 'Resume — Acme Corp',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
    } as never);

    const { getByTestId } = await renderScreen();

    // Rendered from an index route, a bare relative href (e.g. "./new")
    // resolves against the parent of documents/, not documents/ itself —
    // regression coverage for the "Unmatched Route" bug (JEF-310).
    expect(getByTestId('link:./documents/new')).toBeTruthy();
    expect(getByTestId('link:./documents/draft-1')).toBeTruthy();
  });
});
