import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentDraftQueries', () => ({ useDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useUpdateDocumentDraftContent', () => ({
  useUpdateDocumentDraftContent: jest.fn(),
}));
jest.mock('../../hooks/useRenameDocumentDraft', () => ({ useRenameDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useDeleteDocumentDraft', () => ({ useDeleteDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useExportDocumentDraftToPdf', () => ({
  useExportDocumentDraftToPdf: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
  // The real Stack.Screen hands `options` to React Navigation's header, which
  // isn't mounted in these tests — rendering `headerRight()` here instead
  // keeps its buttons (Export, Delete) reachable by testID.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight ? options.headerRight() : null,
  },
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDocumentDraft } from '../../hooks/useDocumentDraftQueries';
import { useUpdateDocumentDraftContent } from '../../hooks/useUpdateDocumentDraftContent';
import { useRenameDocumentDraft } from '../../hooks/useRenameDocumentDraft';
import { useDeleteDocumentDraft } from '../../hooks/useDeleteDocumentDraft';
import { useExportDocumentDraftToPdf } from '../../hooks/useExportDocumentDraftToPdf';
import { DocumentDraftEditorScreen } from '../DocumentDraftEditorScreen';
import type { DocumentDraft } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseDocumentDraft = jest.mocked(useDocumentDraft);
const mockedUseUpdateDocumentDraftContent = jest.mocked(useUpdateDocumentDraftContent);
const mockedUseRenameDocumentDraft = jest.mocked(useRenameDocumentDraft);
const mockedUseDeleteDocumentDraft = jest.mocked(useDeleteDocumentDraft);
const mockedUseExportDocumentDraftToPdf = jest.mocked(useExportDocumentDraftToPdf);
const mockedUseTheme = jest.mocked(useTheme);

const draft: DocumentDraft = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'cover_letter',
  title: 'Cover Letter — Acme Corp',
  contentJson:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dear Hiring Manager,"}]}]}',
  plainText: 'Dear Hiring Manager,',
  sourceDocumentId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1', draftId: 'draft-1' } as never);
  return render(<DocumentDraftEditorScreen />);
}

describe('DocumentDraftEditorScreen', () => {
  const back = jest.fn();
  const updateContentMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseRouter.mockReturnValue({ back } as never);
    mockedUseUpdateDocumentDraftContent.mockReturnValue({
      mutate: updateContentMutate,
      isPending: false,
    } as never);
    mockedUseRenameDocumentDraft.mockReturnValue({ mutate: jest.fn() } as never);
    mockedUseDeleteDocumentDraft.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseExportDocumentDraftToPdf.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
  });

  it('shows a loading indicator while the draft loads', async () => {
    mockedUseDocumentDraft.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen();
    expect(getByTestId('draft-loading')).toBeTruthy();
  });

  it('renders the draft content in the editor', async () => {
    mockedUseDocumentDraft.mockReturnValue({
      data: draft,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen();
    expect(getByTestId('draft-content-input').props.value).toBe('Dear Hiring Manager,');
  });

  it('autosaves edited content after the debounce delay', async () => {
    jest.useFakeTimers();
    mockedUseDocumentDraft.mockReturnValue({
      data: draft,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.changeText(
      getByTestId('draft-content-input'),
      'Dear Hiring Manager,\nUpdated body.',
    );

    jest.advanceTimersByTime(1000);

    expect(updateContentMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        plainText: 'Dear Hiring Manager,\nUpdated body.',
      }),
      expect.any(Object),
    );
    jest.useRealTimers();
  });

  it('deletes the draft after confirmation and navigates back', async () => {
    const deleteMutate = jest.fn((_id, opts) => opts.onSuccess());
    mockedUseDocumentDraft.mockReturnValue({
      data: draft,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteDocumentDraft.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.style === 'destructive');
      confirm?.onPress?.();
    });

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('draft-delete-button'));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith('draft-1', expect.any(Object)));
    expect(back).toHaveBeenCalled();
  });

  it('toggles a heading prefix on the current line from the toolbar', async () => {
    mockedUseDocumentDraft.mockReturnValue({
      data: draft,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('toolbar-h1'));

    expect(getByTestId('draft-content-input').props.value).toBe('# Dear Hiring Manager,');
  });
});
