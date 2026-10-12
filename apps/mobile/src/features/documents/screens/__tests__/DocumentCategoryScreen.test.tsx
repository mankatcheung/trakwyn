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
    useRouter: jest.fn(),
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDocuments } from '../../hooks/useDocumentQueries';
import { useDeleteDocument } from '../../hooks/useDeleteDocument';
import { useUploadDocument } from '../../hooks/useUploadDocument';
import { useDocumentDrafts } from '../../hooks/useDocumentDraftQueries';
import { DocumentCategoryScreen } from '../DocumentCategoryScreen';
import type { DocumentCategory } from '../../lib/documentCategory';
import type { Document } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);
const mockedUseDocuments = jest.mocked(useDocuments);
const mockedUseDeleteDocument = jest.mocked(useDeleteDocument);
const mockedUseUploadDocument = jest.mocked(useUploadDocument);
const mockedUseDocumentDrafts = jest.mocked(useDocumentDrafts);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseRouter = jest.mocked(useRouter);
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

function renderScreen(push = jest.fn(), category: DocumentCategory = 'other') {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<DocumentCategoryScreen category={category} />);
}

describe('DocumentCategoryScreen', () => {
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

    const { getByText } = await renderScreen(jest.fn(), 'resume');

    await waitFor(() => expect(getByText('resume.pdf')).toBeTruthy());
  });

  it('picks a file and uploads it with the type chosen on Other documents', async () => {
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
    const portfolioChip = await findByTestId('document-type-portfolio');
    await fireEvent.press(portfolioChip);
    await fireEvent.press(getByTestId('confirm-upload-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///tmp/resume.pdf',
        name: 'resume.pdf',
        documentType: 'portfolio',
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

    const { getByTestId } = await renderScreen(jest.fn(), 'resume');

    await fireEvent.press(getByTestId('delete-document-1'));

    expect(deleteMutate).toHaveBeenCalledWith('1', expect.any(Object));
  });

  it('renders document drafts with a new-draft entry point', async () => {
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

    const { getByText, getByTestId } = await renderScreen(jest.fn(), 'cover_letter');

    await waitFor(() => expect(getByText('Cover Letter — Acme Corp')).toBeTruthy());
    expect(getByTestId('draft-draft-1')).toBeTruthy();
    expect(getByTestId('new-draft-button')).toBeTruthy();
  });

  it('resolves the draft link against the documents/ subroute, from a flat route', async () => {
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

    const { getByTestId } = await renderScreen(jest.fn(), 'resume');

    // The editor stays at documents/<id>, a sibling directory of this flat
    // route, so the href has to spell `documents/` out (JEF-310, JEF-396).
    expect(getByTestId('link:./documents/draft-1')).toBeTruthy();
  });

  it('navigates to the new-draft screen when the FAB is pressed', async () => {
    const push = jest.fn();
    mockedUseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);

    const { getByTestId } = await renderScreen(push, 'cover_letter');

    await fireEvent.press(getByTestId('new-draft-button'));

    // Its own create screen, so the type is never asked for (JEF-396); a
    // sibling file route, so the same relative-resolution rule as above holds.
    expect(push).toHaveBeenCalledWith('./new-cover-letter');
  });
});

describe('DocumentCategoryScreen — one category per screen (JEF-396)', () => {
  const upload = (id: string, name: string, documentType: string): Document => ({
    ...document,
    id,
    name,
    documentType,
  });
  const draft = (id: string, title: string, type: string) => ({
    id,
    applicationId: 'app-1',
    type,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  const uploads = [
    upload('u-r', 'resume.pdf', 'resume'),
    upload('u-c', 'letter.pdf', 'cover_letter'),
    upload('u-p', 'portfolio.pdf', 'portfolio'),
    upload('u-o', 'notes.pdf', 'other'),
    upload('u-x', 'mystery.pdf', 'some_future_type'),
  ];
  const drafts = [
    draft('dr-r', 'Resume draft', 'resume'),
    draft('dr-c', 'Cover letter draft', 'cover_letter'),
  ];
  const ALL = [
    'resume.pdf',
    'letter.pdf',
    'portfolio.pdf',
    'notes.pdf',
    'mystery.pdf',
    'Resume draft',
    'Cover letter draft',
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseDeleteDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseUploadDocument.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDocuments.mockReturnValue({
      data: uploads,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDocumentDrafts.mockReturnValue({ data: drafts, isLoading: false } as never);
  });

  const visible = (queryByText: (t: string) => unknown) => ALL.filter((n) => queryByText(n));

  it.each([
    ['resume', ['resume.pdf', 'Resume draft']],
    ['cover_letter', ['letter.pdf', 'Cover letter draft']],
    ['other', ['portfolio.pdf', 'notes.pdf', 'mystery.pdf']],
  ] as const)('shows only %s items, drafts and uploads together', async (category, expected) => {
    const { queryByText } = await renderScreen(jest.fn(), category);

    expect(visible(queryByText).sort()).toEqual([...expected].sort());
  });

  it('puts every item on exactly one screen', async () => {
    const seen: string[] = [];
    for (const category of ['cover_letter', 'resume', 'other'] as const) {
      const { queryByText, unmount } = await renderScreen(jest.fn(), category);
      seen.push(...visible(queryByText));
      await unmount();
    }

    expect(seen.sort()).toEqual([...ALL].sort());
  });

  it.each([
    ['cover_letter', 'No cover letters yet.'],
    ['resume', 'No resumes yet.'],
    ['other', 'No other documents yet.'],
  ] as const)('shows a per-category empty state on %s', async (category, message) => {
    mockedUseDocuments.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDocumentDrafts.mockReturnValue({ data: [], isLoading: false } as never);

    const { getByText } = await renderScreen(jest.fn(), category);

    expect(getByText(message)).toBeTruthy();
  });

  it('gives Other documents no new-draft button, only upload', async () => {
    const { queryByTestId } = await renderScreen(jest.fn(), 'other');

    expect(queryByTestId('new-draft-button')).toBeNull();
    expect(queryByTestId('pick-document-button')).toBeTruthy();
  });

  it('sends Resumes to its own create screen', async () => {
    const push = jest.fn();
    const { getByTestId } = await renderScreen(push, 'resume');

    await fireEvent.press(getByTestId('new-draft-button'));

    expect(push).toHaveBeenCalledWith('./new-resume');
  });

  describe('upload type', () => {
    const pickFile = async (category: DocumentCategory, mutate = jest.fn()) => {
      mockedUseUploadDocument.mockReturnValue({ mutate, isPending: false } as never);
      mockedGetDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///tmp/x.pdf',
            name: 'x.pdf',
            mimeType: 'application/pdf',
            size: 10,
            lastModified: 0,
          },
        ],
      });
      const screen = await renderScreen(jest.fn(), category);
      await fireEvent.press(screen.getByTestId('pick-document-button'));
      await screen.findByTestId('confirm-upload-button');
      return screen;
    };

    it.each(['resume', 'cover_letter'] as const)(
      'saves %s uploads with that type and never shows a type chooser',
      async (category) => {
        const mutate = jest.fn();
        const { queryByTestId, getByTestId } = await pickFile(category, mutate);

        expect(queryByTestId('document-type-resume')).toBeNull();
        expect(queryByTestId('document-type-cover_letter')).toBeNull();
        expect(queryByTestId('document-type-other')).toBeNull();

        await fireEvent.press(getByTestId('confirm-upload-button'));

        expect(mutate).toHaveBeenCalledWith(
          expect.objectContaining({ documentType: category }),
          expect.any(Object),
        );
      },
    );

    it('offers Other only the types that stay in it, so a file cannot vanish into another screen', async () => {
      const { queryByTestId } = await pickFile('other');

      expect(queryByTestId('document-type-other')).toBeTruthy();
      expect(queryByTestId('document-type-portfolio')).toBeTruthy();
      expect(queryByTestId('document-type-resume')).toBeNull();
      expect(queryByTestId('document-type-cover_letter')).toBeNull();
    });
  });
});
