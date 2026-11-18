import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const m = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  guard: vi.fn(),
  download: vi.fn(),
  capture: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => m.navigate }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: m.request } }));
vi.mock('#/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: m.guard }));
vi.mock('../../lib/downloadUrl', () => ({ downloadUrl: m.download }));
vi.mock('#/lib/analytics', () => ({
  ANALYTICS_EVENTS: { PDF_EXPORTED: 'pdf_exported' },
  captureEvent: m.capture,
}));
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess } }));

import { gqlContaining, gqlText } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondWith } from '#/__tests__/helpers/gqlMock';
import type { ResultOf } from '@graphql-typed-document-node/core';
import {
  DELETE_DRAFT_MUTATION,
  DRAFT_QUERY,
  EXPORT_PDF_MUTATION,
  RENAME_DRAFT_MUTATION,
  UPDATE_CONTENT_MUTATION,
} from '#/features/documents/graphql/draftEditQueries';
import en from '#/i18n/en.json';
import { useDraftEditor, type EditorDraft } from '../useDraftEditor';

const draft: EditorDraft = {
  id: 'draft-1',
  type: 'resume',
  title: 'My resume',
  contentJson: '{"type":"doc"}',
  plainText: 'hello',
  aiInstructions: 'be nice',
  aiGenerated: false,
  myRating: null,
};

let client: QueryClient;
let updateImpl: () => Promise<ResultOf<typeof UPDATE_CONTENT_MUTATION>>;
let exportImpl: () => Promise<ResultOf<typeof EXPORT_PDF_MUTATION>>;

function setup() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useDraftEditor('app-1', 'draft-1'), { wrapper });
  return { ...hook, invalidate };
}

async function loaded() {
  const hook = setup();
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const writes = () =>
  m.request.mock.calls.filter(([doc]) => gqlText(doc).includes('UpdateDocumentDraftContent'));

const apiError = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'CONFLICT' } }] },
});

describe('useDraftEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateImpl = () => Promise.resolve({});
    exportImpl = () =>
      Promise.resolve({
        exportDocumentDraftToPdf: { id: 'p', name: 'cv.pdf', url: 'https://f.test/cv.pdf' },
      });
    mockGql(m.request, [
      respond(DRAFT_QUERY, { documentDraft: draft }),
      respondWith(UPDATE_CONTENT_MUTATION, () => updateImpl()),
      respondWith(EXPORT_PDF_MUTATION, () => exportImpl()),
      respond(RENAME_DRAFT_MUTATION, (vars) => ({
        renameDocumentDraft: { id: vars.draftId, title: vars.title },
      })),
      respond(DELETE_DRAFT_MUTATION, { deleteDocumentDraft: true }),
    ]);
  });

  describe('loading', () => {
    it('loads the draft and seeds the live text and JSON from it', async () => {
      const { result } = await loaded();
      expect(result.current).toMatchObject({
        draft,
        liveText: 'hello',
        liveJson: '{"type":"doc"}',
        error: null,
        saveState: 'saved',
      });
    });

    it('treats a missing draft as loaded but empty', async () => {
      m.request.mockResolvedValueOnce({ documentDraft: null });
      const { result } = await loaded();
      expect(result.current.draft).toBeNull();
      expect(result.current.liveText).toBe('');
      expect(result.current.liveJson).toBe('');
    });

    it('shows the failure message from an Error', async () => {
      m.request.mockRejectedValueOnce(new Error('network down'));
      const { result } = await loaded();
      expect(result.current.error).toBe('network down');
    });

    it('falls back to the generic message for a non-Error failure', async () => {
      m.request.mockRejectedValueOnce('nope');
      const { result } = await loaded();
      expect(result.current.error).toBe(en['documentDraftEdit.loadFailed']);
    });
  });

  describe('saving content', () => {
    it('saves, records the time, refreshes the draft and the resume checks', async () => {
      const { result, invalidate } = await loaded();
      await act(async () => result.current.handleUpdate('{"a":1}', 'new'));
      expect(m.request).toHaveBeenCalledWith(gqlContaining('UpdateDocumentDraftContent'), {
        input: { draftId: 'draft-1', contentJson: '{"a":1}', plainText: 'new' },
      });
      expect(result.current).toMatchObject({
        saveState: 'saved',
        saveCount: 1,
        saveFailure: null,
        saving: false,
      });
      expect(result.current.lastSaved).toBeInstanceOf(Date);
      expect(result.current.draft).toMatchObject({ contentJson: '{"a":1}', plainText: 'new' });
      expect(result.current.draft?.aiInstructions).toBe('be nice');
      expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it('is saving while the request is on the wire', async () => {
      const { result } = await loaded();
      let release: () => void = () => {};
      updateImpl = () => new Promise((r) => (release = () => r({})));
      act(() => result.current.handleUpdate('{}', 'x'));
      expect(result.current.saveState).toBe('saving');
      await waitFor(() => expect(result.current.saving).toBe(true));
      await act(async () => release());
      await waitFor(() => expect(result.current.saveState).toBe('saved'));
    });

    it('runs queued saves one after another, in order', async () => {
      const { result } = await loaded();
      const order: string[] = [];
      const releases: Array<() => void> = [];
      updateImpl = () =>
        new Promise((r) => {
          order.push(`start-${releases.length}`);
          releases.push(() => r({}));
        });
      act(() => {
        result.current.handleUpdate('{"n":1}', '1');
        result.current.handleUpdate('{"n":2}', '2');
      });
      await waitFor(() => expect(releases).toHaveLength(1));
      expect(order).toEqual(['start-0']);
      await act(async () => releases[0]!());
      await waitFor(() => expect(releases).toHaveLength(2));
      await act(async () => releases[1]!());
      await waitFor(() => expect(result.current.saveState).toBe('saved'));
    });

    it('reports a failed save with the API message, and recovers on the next one', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await loaded();
      updateImpl = () => Promise.reject(apiError('Quota full'));
      await act(async () => result.current.handleUpdate('{}', 'x'));
      expect(result.current.saveState).toBe('error');
      expect(result.current.saveFailure?.message).toContain('Quota full');
      updateImpl = () => Promise.resolve({});
      await act(async () => result.current.handleUpdate('{}', 'y'));
      expect(result.current.saveState).toBe('saved');
      expect(result.current.saveFailure).toBeNull();
    });

    it('is dirty after setDirty(true), and a save clears it', async () => {
      const { result } = await loaded();
      act(() => result.current.setDirty(true));
      expect(result.current.saveState).toBe('dirty');
      await act(async () => result.current.handleUpdate('{}', 'x'));
      expect(result.current.saveState).toBe('saved');
    });

    it('turns the unsaved-changes guard on whenever the state is not saved', async () => {
      const { result } = await loaded();
      expect(m.guard).toHaveBeenLastCalledWith(false, en['documentDraftEdit.leaveConfirm']);
      act(() => result.current.setDirty(true));
      expect(m.guard).toHaveBeenLastCalledWith(true, en['documentDraftEdit.leaveConfirm']);
    });
  });

  describe('rename', () => {
    it('renames through the queue, updates the draft and refreshes the list', async () => {
      const { result, invalidate } = await loaded();
      let ok = false;
      await act(async () => {
        ok = await result.current.renameTitle('New name');
      });
      expect(ok).toBe(true);
      expect(m.request).toHaveBeenCalledWith(gqlContaining('RenameDocumentDraft'), {
        draftId: 'draft-1',
        title: 'New name',
      });
      expect(result.current.draft?.title).toBe('New name');
      expect(invalidate).toHaveBeenCalled();
      expect(result.current.saving).toBe(false);
    });

    it('reports a failed rename and keeps the old title', async () => {
      const { result } = await loaded();
      m.request.mockRejectedValueOnce(apiError('Title taken'));
      let ok = true;
      await act(async () => {
        ok = await result.current.renameTitle('X');
      });
      expect(ok).toBe(false);
      expect(result.current.error).toContain('Title taken');
      expect(result.current.draft?.title).toBe('My resume');
    });
  });

  describe('AI and import saves', () => {
    it('saves an AI result with its prompt, marks the old content as replaced, and shows it live', async () => {
      const { result } = await loaded();
      await act(async () => {
        await result.current.handleAiSave('{"ai":1}', 'ai text', 'make it short');
      });
      expect(m.request).toHaveBeenCalledWith(gqlContaining('UpdateDocumentDraftContent'), {
        input: {
          draftId: 'draft-1',
          contentJson: '{"ai":1}',
          plainText: 'ai text',
          aiInstructions: 'make it short',
          replacedByAi: true,
        },
      });
      expect(result.current).toMatchObject({
        liveText: 'ai text',
        liveJson: '{"ai":1}',
        aiUnsaved: false,
      });
      expect(result.current.draft?.aiInstructions).toBe('make it short');
    });

    it('keeps the AI result as unsaved when its save fails, and clears it on the next good save', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await loaded();
      updateImpl = () => Promise.reject(new Error('x'));
      await act(async () => {
        await result.current.handleAiSave('{}', 'ai', 'p');
      });
      expect(result.current.aiUnsaved).toBe(true);
      expect(result.current.liveText).toBe('ai');
      updateImpl = () => Promise.resolve({});
      await act(async () => result.current.handleUpdate('{}', 'typed'));
      expect(result.current.aiUnsaved).toBe(false);
    });

    it('saves an import without marking anything replaced, keeping the prompt as it was', async () => {
      const { result } = await loaded();
      await act(async () => {
        await result.current.handleImportSave('{"i":1}', 'imported');
      });
      const input = writes().at(-1)![1].input;
      expect(input).toMatchObject({ aiInstructions: 'be nice', plainText: 'imported' });
      expect(input).not.toHaveProperty('replacedByAi');
    });

    it('reuses the last AI prompt for a later import', async () => {
      const { result } = await loaded();
      await act(async () => {
        await result.current.handleAiSave('{}', 'a', 'latest prompt');
      });
      await act(async () => {
        await result.current.handleImportSave('{}', 'b');
      });
      expect(writes().at(-1)![1].input.aiInstructions).toBe('latest prompt');
    });

    it('uses an empty prompt for an import into a draft that has none', async () => {
      m.request.mockResolvedValueOnce({ documentDraft: { ...draft, aiInstructions: null } });
      const { result } = await loaded();
      await act(async () => {
        await result.current.handleImportSave('{}', 'b');
      });
      expect(writes().at(-1)![1].input.aiInstructions).toBe('');
    });

    it('saves an accepted inline suggestion as a replacement, without touching the prompt', async () => {
      const { result } = await loaded();
      await act(async () => result.current.handleInlineAiApplied('{"s":1}', 'suggested'));
      await waitFor(() => expect(writes()).toHaveLength(1));
      const input = writes()[0]![1].input;
      expect(input).toMatchObject({ plainText: 'suggested', replacedByAi: true });
      expect(input).not.toHaveProperty('aiInstructions');
      expect(result.current.liveText).toBe('suggested');
    });

    it('flags an inline suggestion whose save fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await loaded();
      updateImpl = () => Promise.reject(new Error('x'));
      await act(async () => result.current.handleInlineAiApplied('{}', 's'));
      await waitFor(() => expect(result.current.aiUnsaved).toBe(true));
    });
  });

  describe('retry', () => {
    function fakeEditor() {
      return {
        getJson: vi.fn(() => '{"on":"screen"}'),
        getText: vi.fn(() => 'on screen'),
        replaceContent: vi.fn(),
      };
    }

    it('does nothing without an editor', async () => {
      const { result } = await loaded();
      act(() => {
        result.current.retryContentSave();
        result.current.retryAiSave();
      });
      expect(writes()).toHaveLength(0);
    });

    it('resends what is on screen now', async () => {
      const { result } = await loaded();
      result.current.editorRef.current = fakeEditor() as never;
      await act(async () => result.current.retryContentSave());
      expect(writes()[0]![1].input).toMatchObject({
        contentJson: '{"on":"screen"}',
        plainText: 'on screen',
      });
    });

    it('retries an AI save with the draft’s prompt', async () => {
      const { result } = await loaded();
      result.current.editorRef.current = fakeEditor() as never;
      await act(async () => result.current.retryAiSave());
      await waitFor(() => expect(writes()).toHaveLength(1));
      expect(writes()[0]![1].input).toMatchObject({
        aiInstructions: 'be nice',
        replacedByAi: true,
      });
    });
  });

  describe('settleSaves', () => {
    it('flushes the editor and reports true when nothing is pending', async () => {
      const { result } = await loaded();
      const flush = vi.fn();
      result.current.flushEditorRef.current = flush;
      let ok = false;
      await act(async () => {
        ok = await result.current.settleSaves();
      });
      expect(flush).toHaveBeenCalled();
      expect(ok).toBe(true);
    });

    it('works without an editor to flush', async () => {
      const { result } = await loaded();
      let ok = false;
      await act(async () => {
        ok = await result.current.settleSaves();
      });
      expect(ok).toBe(true);
    });

    it('waits for a save in flight and reports its outcome', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await loaded();
      let fail: () => void = () => {};
      updateImpl = () => new Promise((_, rej) => (fail = () => rej(new Error('x'))));
      let settled: boolean | undefined;
      act(() => {
        result.current.handleUpdate('{}', 'x');
      });
      const pending = result.current.settleSaves().then((ok) => (settled = ok));
      await act(async () => {});
      expect(settled).toBeUndefined();
      await act(async () => {
        fail();
        await pending;
      });
      expect(settled).toBe(false);
    });
  });

  describe('restore', () => {
    const restored = { contentJson: '{"type":"doc","content":[{"type":"p"}]}', plainText: 'old' };

    it('puts the restored version on screen and clears every failure flag', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, invalidate } = await loaded();
      const editor = { replaceContent: vi.fn(), getJson: vi.fn(), getText: vi.fn() };
      result.current.editorRef.current = editor as never;
      updateImpl = () => Promise.reject(new Error('x'));
      await act(async () => result.current.handleUpdate('{}', 'x'));
      expect(result.current.saveState).toBe('error');
      invalidate.mockClear();

      act(() => result.current.handleRestored(restored as never));
      expect(editor.replaceContent).toHaveBeenCalledWith([{ type: 'p' }]);
      expect(result.current).toMatchObject({
        liveText: 'old',
        liveJson: restored.contentJson,
        saveState: 'saved',
        saveFailure: null,
        aiUnsaved: false,
      });
      expect(result.current.draft).toMatchObject({ plainText: 'old' });
      expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it('shows content the editor cannot read as empty', async () => {
      const { result } = await loaded();
      const editor = { replaceContent: vi.fn() };
      result.current.editorRef.current = editor as never;
      act(() =>
        result.current.handleRestored({ contentJson: 'not json', plainText: 'p' } as never),
      );
      expect(editor.replaceContent).toHaveBeenCalledWith([]);
    });

    it('treats a document with no content array as empty', async () => {
      const { result } = await loaded();
      const editor = { replaceContent: vi.fn() };
      result.current.editorRef.current = editor as never;
      act(() => result.current.handleRestored({ contentJson: '{}', plainText: '' } as never));
      expect(editor.replaceContent).toHaveBeenCalledWith([]);
    });

    it('still updates state with no editor mounted', async () => {
      const { result } = await loaded();
      act(() => result.current.handleRestored(restored as never));
      expect(result.current.liveText).toBe('old');
    });

    it('leaves a missing draft alone', async () => {
      m.request.mockResolvedValueOnce({ documentDraft: null });
      const { result } = await loaded();
      act(() => result.current.handleRestored(restored as never));
      expect(result.current.draft).toBeNull();
    });
  });

  describe('export', () => {
    it('does nothing without a draft', async () => {
      m.request.mockResolvedValueOnce({ documentDraft: null });
      const { result } = await loaded();
      await act(async () => result.current.handleExportPdf());
      expect(m.request).toHaveBeenCalledTimes(1);
    });

    it('flushes, exports, downloads, reports it and offers a way to open the file', async () => {
      const { result, invalidate } = await loaded();
      const flush = vi.fn();
      result.current.flushEditorRef.current = flush;
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      await act(async () => result.current.handleExportPdf());

      expect(flush).toHaveBeenCalled();
      expect(m.request).toHaveBeenCalledWith(gqlContaining('ExportDocumentDraftToPdf'), {
        draftId: 'draft-1',
      });
      expect(m.capture).toHaveBeenCalledWith('pdf_exported');
      expect(m.download).toHaveBeenCalledWith('https://f.test/cv.pdf', 'cv.pdf');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['documents', 'app-1'] });
      expect(result.current.exporting).toBe(false);

      const [message, options] = m.toastSuccess.mock.calls[0]!;
      expect(message).toBe(en['documentDraftEdit.exportSucceeded']);
      expect(options.action.label).toBe(en['documentDraftEdit.openPdf']);
      options.action.onClick();
      expect(open).toHaveBeenCalledWith('https://f.test/cv.pdf', '_blank', 'noopener');
    });

    it('refuses to export when the latest save failed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = await loaded();
      updateImpl = () => Promise.reject(new Error('x'));
      act(() => {
        result.current.handleUpdate('{}', 'x');
      });
      await act(async () => result.current.handleExportPdf());
      expect(result.current.error).toBe(en['documentDraftEdit.exportUnsaved']);
      expect(m.download).not.toHaveBeenCalled();
      expect(result.current.exporting).toBe(false);
    });

    it('reports an export failure', async () => {
      const { result } = await loaded();
      exportImpl = () => Promise.reject(apiError('Renderer down'));
      await act(async () => result.current.handleExportPdf());
      expect(result.current.error).toContain('Renderer down');
      expect(m.toastSuccess).not.toHaveBeenCalled();
      expect(result.current.exporting).toBe(false);
    });
  });

  describe('delete', () => {
    it('does nothing without a draft', async () => {
      m.request.mockResolvedValueOnce({ documentDraft: null });
      const { result } = await loaded();
      const ask = vi.spyOn(window, 'confirm');
      await act(async () => result.current.handleDelete());
      expect(ask).not.toHaveBeenCalled();
    });

    it('does nothing when the user declines', async () => {
      const { result } = await loaded();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await act(async () => result.current.handleDelete());
      expect(m.request).toHaveBeenCalledTimes(1);
      expect(m.navigate).not.toHaveBeenCalled();
    });

    it('deletes and goes back to the application', async () => {
      const { result } = await loaded();
      const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
      await act(async () => result.current.handleDelete());
      expect(ask).toHaveBeenCalledWith(en['documentDraftEdit.deleteConfirm']);
      expect(m.request).toHaveBeenCalledWith(gqlContaining('DeleteDocumentDraft'), {
        id: 'draft-1',
      });
      expect(m.navigate).toHaveBeenCalledWith({
        to: '/applications/$applicationId',
        params: { applicationId: 'app-1' },
      });
    });

    it('shows the failure and stays on the page', async () => {
      const { result } = await loaded();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      m.request.mockRejectedValueOnce(new Error('in use'));
      await act(async () => result.current.handleDelete());
      expect(result.current.error).toBe('in use');
      expect(m.navigate).not.toHaveBeenCalled();
    });

    it('falls back to the generic message for a non-Error failure', async () => {
      const { result } = await loaded();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      m.request.mockRejectedValueOnce('nope');
      await act(async () => result.current.handleDelete());
      expect(result.current.error).toBe(en['documentDraftEdit.deleteFailed']);
    });
  });
});
