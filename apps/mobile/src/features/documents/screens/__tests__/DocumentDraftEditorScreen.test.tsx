import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDocumentDraftQueries', () => ({ useDocumentDraft: jest.fn() }));
jest.mock('../../hooks/useDraftSaver', () => ({ useDraftSaver: jest.fn() }));
jest.mock('../../hooks/useDraftAiHelper', () => ({
  useDraftAiHelper: jest.fn(),
  AI_PROMPT_MAX_LENGTH: 500,
}));
// The sheet and import list have their own tests; here they only have to be wired.
jest.mock('../../components/AiHelperSheet', () => {
  const { View } = require('react-native');
  return {
    AiHelperSheet: (props: Record<string, unknown>) => {
      mockSheetProps(props);
      return props.visible ? <View testID="ai-helper-sheet-mock" /> : null;
    },
  };
});
jest.mock('../../components/ImportFromDocument', () => {
  const { Pressable } = require('react-native');
  return {
    ImportFromDocument: ({ onImport }: { onImport: (t: string) => void }) => (
      <Pressable testID="import-mock" onPress={() => onImport('Imported text')} />
    ),
  };
});
const mockSheetProps = jest.fn();
jest.mock('../../hooks/useSelectionAi', () => ({ useSelectionAi: jest.fn() }));
jest.mock('../../components/SelectionAiBar', () => {
  const { View } = require('react-native');
  return { SelectionAiBar: () => <View testID="selection-ai-bar-mock" /> };
});
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
import { useDraftSaver } from '../../hooks/useDraftSaver';
import { useSelectionAi } from '../../hooks/useSelectionAi';
import { useDraftAiHelper } from '../../hooks/useDraftAiHelper';
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
const mockedUseDraftSaver = jest.mocked(useDraftSaver);
const mockedUseDraftAiHelper = jest.mocked(useDraftAiHelper);
const mockedUseSelectionAi = jest.mocked(useSelectionAi);
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
  aiInstructions: 'Keep it short',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1', draftId: 'draft-1' } as never);
  return render(<DocumentDraftEditorScreen />);
}

describe('DocumentDraftEditorScreen', () => {
  const back = jest.fn();
  const save = jest.fn().mockResolvedValue(true);
  const retry = jest.fn();
  const baseSaver = {
    save,
    retry,
    saving: false,
    error: null as string | null,
    clearError: jest.fn(),
    lastSavedAt: null as string | null,
    setLastSavedAt: jest.fn(),
  };
  const baseAi = {
    running: false,
    suggestion: null,
    failure: null,
    generate: jest.fn().mockResolvedValue(true),
    polish: jest.fn(),
    replace: jest.fn(),
    insertBelow: jest.fn(),
    discard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseRouter.mockReturnValue({ back } as never);
    mockedUseDraftSaver.mockReturnValue(baseSaver as never);
    mockedUseDraftAiHelper.mockReturnValue(baseAi as never);
    mockedUseSelectionAi.mockReturnValue({
      state: { phase: 'idle' },
      running: false,
      openAsk: jest.fn(),
      run: jest.fn(),
      accept: jest.fn(),
      dismiss: jest.fn(),
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

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: 'Dear Hiring Manager,\nUpdated body.' }),
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

  const loaded = (data: DocumentDraft = draft) =>
    mockedUseDocumentDraft.mockReturnValue({
      data,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

  it('edits the title inline and renames on blur', async () => {
    const rename = jest.fn();
    mockedUseRenameDocumentDraft.mockReturnValue({ mutate: rename } as never);
    loaded();

    const { getByTestId } = await renderScreen();
    const input = getByTestId('draft-title-input');
    expect(input.props.value).toBe('Cover Letter — Acme Corp');
    await fireEvent.changeText(input, 'My letter');
    await fireEvent(input, 'blur');

    expect(rename).toHaveBeenCalledWith(
      { draftId: 'draft-1', title: 'My letter' },
      expect.any(Object),
    );
  });

  it('imports a document into an empty draft and saves it', async () => {
    loaded({
      ...draft,
      contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
      plainText: '',
    });
    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('import-mock'));

    expect(getByTestId('draft-content-input').props.value).toBe('Imported text');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ plainText: 'Imported text' }));
  });

  it('hides import once the draft has text', async () => {
    loaded();
    const { queryByTestId } = await renderScreen();
    expect(queryByTestId('import-mock')).toBeNull();
  });

  it('opens the AI helper with the saved prompt and the live text state', async () => {
    loaded();
    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('ai-helper-open'));

    expect(getByTestId('ai-helper-sheet-mock')).toBeTruthy();
    const props = mockSheetProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      instructions: 'Keep it short',
      hasText: true,
      type: 'cover_letter',
    });
  });

  it('makes the editor read-only while an AI request runs', async () => {
    mockedUseDraftAiHelper.mockReturnValue({ ...baseAi, running: true } as never);
    loaded();

    const { getByTestId } = await renderScreen();
    expect(getByTestId('draft-content-input').props.editable).toBe(false);
  });

  it('offers Retry when a save failed and retries it', async () => {
    mockedUseDraftSaver.mockReturnValue({ ...baseSaver, error: 'Offline' } as never);
    loaded();

    const { getByTestId } = await renderScreen();
    expect(getByTestId('draft-save-error').props.children).toBe('Offline');
    await fireEvent.press(getByTestId('draft-save-retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('autosave reads the text at fire time so an AI result is not overwritten', async () => {
    jest.useFakeTimers();
    loaded();
    const { getByTestId } = await renderScreen();
    await fireEvent.changeText(getByTestId('draft-content-input'), 'typed');
    // An AI result lands (through the helper's setText) before the debounce fires.
    const { setText } = mockedUseDraftAiHelper.mock.calls.at(-1)![0];
    await act(async () => setText('AI text'));
    jest.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ plainText: 'AI text' }));
    jest.useRealTimers();
  });
  it('opens a formatted draft as Markdown and saves it back as formatting', async () => {
    jest.useFakeTimers();
    const formatted = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Jane' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Built', marks: [{ type: 'bold' }] }],
        },
      ],
    });
    loaded({ ...draft, contentJson: formatted, plainText: 'Jane\n\nBuilt' });
    const { getByTestId, queryByTestId } = await renderScreen();
    const input = getByTestId('draft-content-input');
    expect(input.props.value).toBe('# Jane\n\n**Built**');
    expect(queryByTestId('draft-lossy-banner')).toBeNull();

    await fireEvent.changeText(input, '# Jane\n\n**Built** things');
    jest.advanceTimersByTime(1000);

    const saved = save.mock.calls.at(-1)![0];
    expect(saved.plainText).toBe('Jane\n\nBuilt things');
    expect(JSON.parse(saved.contentJson).content[0]).toMatchObject({ type: 'heading' });
    jest.useRealTimers();
  });

  describe('a draft with formatting Markdown cannot show', () => {
    const aligned = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Centred' }],
        },
      ],
    });

    it('shows the banner and does not autosave until Edit anyway', async () => {
      jest.useFakeTimers();
      loaded({ ...draft, contentJson: aligned, plainText: 'Centred' });
      const { getByTestId, queryByTestId } = await renderScreen();
      expect(getByTestId('draft-lossy-banner')).toBeTruthy();

      await fireEvent.changeText(getByTestId('draft-content-input'), 'Centred!');
      jest.advanceTimersByTime(1000);
      expect(save).not.toHaveBeenCalled();

      await fireEvent.press(getByTestId('draft-lossy-edit-anyway'));
      expect(queryByTestId('draft-lossy-banner')).toBeNull();
      expect(save).not.toHaveBeenCalled();

      await fireEvent.changeText(getByTestId('draft-content-input'), 'Centred!!');
      jest.advanceTimersByTime(1000);
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ plainText: 'Centred!!' }));
      jest.useRealTimers();
    });
  });

  it('shows the selection AI bar only while text is selected', async () => {
    loaded();
    const { getByTestId, queryByTestId } = await renderScreen();
    expect(queryByTestId('selection-ai-bar-mock')).toBeNull();

    await fireEvent(getByTestId('draft-content-input'), 'selectionChange', {
      nativeEvent: { selection: { start: 0, end: 4 } },
    });
    expect(getByTestId('selection-ai-bar-mock')).toBeTruthy();

    await fireEvent(getByTestId('draft-content-input'), 'selectionChange', {
      nativeEvent: { selection: { start: 4, end: 4 } },
    });
    expect(queryByTestId('selection-ai-bar-mock')).toBeNull();
  });

  it('is read-only while a selection request runs', async () => {
    loaded();
    mockedUseSelectionAi.mockReturnValue({
      state: { phase: 'loading', range: { start: 0, end: 4, text: 'Dear' } },
      running: true,
      openAsk: jest.fn(),
      run: jest.fn(),
      accept: jest.fn(),
      dismiss: jest.fn(),
    } as never);
    const { getByTestId } = await renderScreen();
    expect(getByTestId('draft-content-input').props.editable).toBe(false);
  });
});
