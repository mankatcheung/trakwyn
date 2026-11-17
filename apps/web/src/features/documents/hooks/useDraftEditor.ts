import { useState, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { useUnsavedChangesGuard } from '#/hooks/useUnsavedChangesGuard';
import type { AiRating } from '#/features/ai/lib/aiFeedback';
import { downloadUrl } from '../lib/downloadUrl';
import { deriveSaveState, hasUnsavedWork } from '../lib/editor/saveState';
import type { DocumentEditorHandle } from '../components/editor/DocumentDraftEditor';
import {
  DELETE_DRAFT_MUTATION,
  DRAFT_QUERY,
  EXPORT_PDF_MUTATION,
  RENAME_DRAFT_MUTATION,
  UPDATE_CONTENT_MUTATION,
} from '../graphql/draftEditQueries';
import { documentDraftsQueryKey } from '../graphql/documentQueries';
import type { RestoredDraft } from '../graphql/draftHistoryQueries';
import { resumeAtsScoresQueryKey } from '../graphql/resumeAtsQueries';
import { resumeMatchesQueryKey } from '../graphql/resumeMatchQueries';

interface ExportedPdf {
  id: string;
  name: string;
  url: string;
}

export interface EditorDraft {
  id: string;
  type: string;
  title: string;
  contentJson: string;
  plainText: string;
  aiInstructions: string | null;
  /** The draft has an AI generation behind it, so it can be rated (JEF-547). */
  aiGenerated: boolean;
  myRating: AiRating | null;
}

/**
 * Everything the draft editor page does besides drawing: loading the draft, the
 * save queue and its status, the AI helper's and the import's saves, restoring
 * a version, exporting to PDF and deleting. The page only lays out what this returns.
 */
export function useDraftEditor(applicationId: string, draftId: string) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The editor debounces saves, and a save can still be on the wire when the
  // user clicks Export — which renders what the server has, not what is on
  // screen. Export flushes the first and waits out the second.
  const flushEditorRef = useRef<(() => void) | null>(null);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  // The AI helper reads and changes the visible editor through this.
  const editorRef = useRef<DocumentEditorHandle | null>(null);
  // Saves run one after another, in the order they were asked for, so an older
  // one (the editor's flush before an AI result is applied) cannot land after it.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const aiInstructionsRef = useRef<string | undefined>(undefined);
  // The text on screen, ahead of the debounced save: the helper chooses
  // Generate or Polish by it, and a preview goes stale when it changes.
  const [liveText, setLiveText] = useState('');
  // The document JSON on screen, for the resume checks (JEF-585).
  const [liveJson, setLiveJson] = useState('');
  // The helper's last result is on screen but its save failed.
  const [aiUnsaved, setAiUnsaved] = useState(false);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Save state for the status line (JEF-577). `dirty`: typed since the last save was
  // asked for. `inFlight`: content saves asked for and not yet settled (counted from
  // the request, not from when the queue reaches it, so there is no gap showing
  // Saved between two queued saves). `saveFailure`: the last one failed, with its message.
  const [dirty, setDirty] = useState(false);
  const [inFlight, setInFlight] = useState(0);
  const [saveFailure, setSaveFailure] = useState<{ message: string } | null>(null);
  // Draft history (JEF-584): a counter that changes with every save.
  const [saveCount, setSaveCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gqlClient
      .request<{ documentDraft: EditorDraft | null }>(DRAFT_QUERY, { id: draftId })
      .then((res) => {
        setDraft(res.documentDraft);
        setLiveText(res.documentDraft?.plainText ?? '');
        setLiveJson(res.documentDraft?.contentJson ?? '');
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('documentDraftEdit.loadFailed')),
      )
      .finally(() => setLoading(false));
  }, [draftId, t]);

  const saveContent = (
    contentJson: string,
    plainText: string,
    aiInstructions?: string,
    replacedByAi = false,
  ): Promise<boolean> => {
    setInFlight((n) => n + 1);
    const run = saveQueueRef.current
      .then(() => writeContent(contentJson, plainText, aiInstructions, replacedByAi))
      .finally(() => setInFlight((n) => n - 1));
    saveQueueRef.current = run;
    return run;
  };

  const invalidateResumeChecks = () => {
    // The resume's saved match and ATS result are stale once its text changes;
    // refetch so the Resumes list shows the reminder instead of a cached "up to
    // date" result.
    void queryClient.invalidateQueries({ queryKey: resumeMatchesQueryKey(applicationId) });
    void queryClient.invalidateQueries({ queryKey: resumeAtsScoresQueryKey(applicationId) });
  };

  const writeContent = async (
    contentJson: string,
    plainText: string,
    aiInstructions?: string,
    replacedByAi = false,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await gqlClient.request(UPDATE_CONTENT_MUTATION, {
        input: {
          draftId,
          contentJson,
          plainText,
          ...(aiInstructions !== undefined && { aiInstructions }),
          // The server keeps the content an AI result replaces (JEF-584).
          ...(replacedByAi && { replacedByAi }),
        },
      });
      setLastSaved(new Date());
      setSaveFailure(null);
      setSaveCount((n) => n + 1);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              contentJson,
              plainText,
              aiInstructions: aiInstructions ?? prev.aiInstructions,
            }
          : prev,
      );
      invalidateResumeChecks();
      return true;
    } catch (err) {
      console.error('Failed to save:', err);
      setSaveFailure({ message: getErrorMessage(err) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Export waits for whatever save was asked for last.
  const trackSave = (save: Promise<boolean>) => {
    pendingSaveRef.current = save;
    void save.finally(() => {
      if (pendingSaveRef.current === save) pendingSaveRef.current = null;
    });
  };

  const handleUpdate = (contentJson: string, plainText: string) => {
    // The editor hands over its latest content, so nothing is left waiting.
    setDirty(false);
    const save = saveContent(contentJson, plainText);
    trackSave(save);
    void save.then((ok) => {
      // What is on screen is now saved, whatever the helper had left unsaved.
      if (ok) setAiUnsaved(false);
    });
  };

  // The title is saved through the same queue and tracking as the content.
  const renameTitle = (title: string): Promise<boolean> => {
    const run = saveQueueRef.current.then(async () => {
      setSaving(true);
      setError(null);
      try {
        await gqlClient.request(RENAME_DRAFT_MUTATION, { draftId, title });
        setDraft((d) => (d ? { ...d, title } : d));
        void queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) });
        return true;
      } catch (err) {
        setError(getErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    });
    saveQueueRef.current = run;
    trackSave(run);
    return run;
  };

  // The helper's saves go through the same pending-save tracking as the editor's,
  // so Export waits for them too.
  const handleAiSave = (
    contentJson: string,
    plainText: string,
    aiInstructions: string,
    // An imported document goes into a blank draft: nothing is being replaced to keep.
    replacedByAi = true,
  ) => {
    // The editor is already showing the result: count it as the text even if the
    // save fails, and keep the failure visible with a way to retry.
    setLiveText(plainText);
    setLiveJson(contentJson);
    aiInstructionsRef.current = aiInstructions;
    const save = saveContent(contentJson, plainText, aiInstructions, replacedByAi);
    trackSave(save);
    void save.then((ok) => setAiUnsaved(!ok));
    return save;
  };

  // An imported document is saved like an AI result, keeping the prompt as it was.
  const handleImportSave = (contentJson: string, plainText: string) =>
    handleAiSave(
      contentJson,
      plainText,
      aiInstructionsRef.current ?? draft?.aiInstructions ?? '',
      false,
    );

  // Retry sends what is on screen now, not the content of the attempt that failed.
  const retryContentSave = () => {
    const editor = editorRef.current;
    if (!editor) return;
    handleUpdate(editor.getJson(), editor.getText());
  };

  const retryAiSave = () => {
    const editor = editorRef.current;
    if (!editor) return;
    void handleAiSave(
      editor.getJson(),
      editor.getText(),
      aiInstructionsRef.current ?? draft?.aiInstructions ?? '',
    );
  };

  // An accepted inline suggestion (JEF-583) is saved like an AI result: the server keeps what
  // it replaced in the draft's history. The draft's own prompt is left as it was.
  const handleInlineAiApplied = (contentJson: string, plainText: string) => {
    setLiveText(plainText);
    setLiveJson(contentJson);
    const save = saveContent(contentJson, plainText, undefined, true);
    trackSave(save);
    void save.then((ok) => setAiUnsaved(!ok));
  };

  // Save version and Restore act on what the server holds, so the editor's pending
  // edit is sent first and waited out. False means that save failed.
  const settleSaves = async (): Promise<boolean> => {
    flushEditorRef.current?.();
    return (await (pendingSaveRef.current ?? Promise.resolve(true))) !== false;
  };

  // The server has put an earlier version back: show it, without a save of its own.
  const handleRestored = (restored: RestoredDraft) => {
    let nodes: unknown[] = [];
    try {
      const parsed = JSON.parse(restored.contentJson) as { content?: unknown[] };
      nodes = parsed.content ?? [];
    } catch {
      // Content the server accepted but the editor cannot read: show it empty rather than stale.
    }
    editorRef.current?.replaceContent(
      nodes as Parameters<DocumentEditorHandle['replaceContent']>[0],
    );
    setLiveText(restored.plainText);
    setLiveJson(restored.contentJson);
    setDraft((prev) =>
      prev ? { ...prev, contentJson: restored.contentJson, plainText: restored.plainText } : prev,
    );
    setLastSaved(new Date());
    setAiUnsaved(false);
    setDirty(false);
    setSaveFailure(null);
    invalidateResumeChecks();
  };

  const handleExportPdf = async () => {
    if (!draft) return;
    setExporting(true);
    setError(null);
    try {
      flushEditorRef.current?.();
      const saved = await (pendingSaveRef.current ?? Promise.resolve(true));
      if (!saved) {
        setError(t('documentDraftEdit.exportUnsaved'));
        return;
      }

      const res = await gqlClient.request<{ exportDocumentDraftToPdf: ExportedPdf }>(
        EXPORT_PDF_MUTATION,
        { draftId: draft.id },
      );
      const pdf = res.exportDocumentDraftToPdf;
      captureEvent(ANALYTICS_EVENTS.PDF_EXPORTED);
      void queryClient.invalidateQueries({ queryKey: ['documents', applicationId] });
      downloadUrl(pdf.url, pdf.name);
      // The automatic download can be blocked (it follows an await, so the
      // click's user activation may have lapsed) — the toast keeps a way to it.
      toast.success(t('documentDraftEdit.exportSucceeded'), {
        action: {
          label: t('documentDraftEdit.openPdf'),
          onClick: () => window.open(pdf.url, '_blank', 'noopener'),
        },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!draft || !confirm(t('documentDraftEdit.deleteConfirm'))) return;
    try {
      await gqlClient.request(DELETE_DRAFT_MUTATION, { id: draft.id });
      await navigate({ to: '/applications/$applicationId', params: { applicationId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentDraftEdit.deleteFailed'));
    }
  };

  const saveState = deriveSaveState({
    dirty,
    saving: inFlight > 0,
    failed: saveFailure !== null || aiUnsaved,
  });
  useUnsavedChangesGuard(hasUnsavedWork(saveState), t('documentDraftEdit.leaveConfirm'));

  return {
    draft,
    loading,
    saving,
    exporting,
    lastSaved,
    error,
    aiUnsaved,
    saveFailure,
    saveState,
    saveCount,
    liveText,
    liveJson,
    flushEditorRef,
    editorRef,
    setLiveText,
    setLiveJson,
    setDirty,
    handleUpdate,
    renameTitle,
    handleAiSave,
    handleImportSave,
    handleInlineAiApplied,
    retryContentSave,
    retryAiSave,
    settleSaves,
    handleRestored,
    handleExportPdf,
    handleDelete,
  };
}
