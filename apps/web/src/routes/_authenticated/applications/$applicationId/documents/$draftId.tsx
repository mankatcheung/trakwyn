import { useState, useEffect, useRef } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { downloadUrl } from '#/lib/downloadUrl';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { DocumentDraftEditor, type DocumentEditorHandle } from '../-components/DocumentDraftEditor';
import { AiHelperPanel } from '../-components/AiHelperPanel';
import { DraftTitleField } from '../-components/DraftTitleField';
import { ImportDocumentAction } from '../-components/ImportDocumentAction';
import { documentDraftsQueryKey } from '../-documentQueries';
import { resumeAtsScoresQueryKey } from '../-resumeAtsQueries';
import { resumeMatchesQueryKey } from '../-resumeMatchQueries';
import { DownloadIcon, TrashIcon, ArrowLeftIcon } from 'lucide-react';
import { Alert, Button, IconButton } from '@trakwyn/ui';

const DRAFT_QUERY = `
  query DocumentDraft($id: ID!) {
    documentDraft(id: $id) {
      id
      applicationId
      type
      title
      contentJson
      plainText
      sourceDocumentId
      aiInstructions
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_CONTENT_MUTATION = `
  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {
    updateDocumentDraftContent(input: $input) {
      id
      updatedAt
    }
  }
`;

const EXPORT_PDF_MUTATION = `
  mutation ExportDocumentDraftToPdf($draftId: ID!) {
    exportDocumentDraftToPdf(draftId: $draftId) {
      id
      name
      url
    }
  }
`;

const RENAME_DRAFT_MUTATION = `
  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {
    renameDocumentDraft(draftId: $draftId, title: $title) {
      id
      title
    }
  }
`;

const DELETE_DRAFT_MUTATION = `
  mutation DeleteDocumentDraft($id: ID!) {
    deleteDocumentDraft(id: $id)
  }
`;

export const Route = createFileRoute(
  '/_authenticated/applications/$applicationId/documents/$draftId',
)({
  component: DocumentDraftEditPage,
});

interface ExportedPdf {
  id: string;
  name: string;
  url: string;
}

// Not exported on purpose (JEF-537): TanStack's code splitter leaves a route
// component alone when the file also exports it, and this one pulls in the whole
// rich-text editor. Tests reach it through `Route.component`.
function DocumentDraftEditPage() {
  const { t } = useLocale();
  const { applicationId, draftId } = Route.useParams();
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
  // The helper's last result is on screen but its save failed.
  const [aiUnsaved, setAiUnsaved] = useState(false);
  const [draft, setDraft] = useState<{
    id: string;
    type: string;
    title: string;
    contentJson: string;
    plainText: string;
    aiInstructions: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gqlClient
      .request<{ documentDraft: typeof draft }>(DRAFT_QUERY, { id: draftId })
      .then((res) => {
        setDraft(res.documentDraft);
        setLiveText(res.documentDraft?.plainText ?? '');
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
  ): Promise<boolean> => {
    const run = saveQueueRef.current.then(() =>
      writeContent(contentJson, plainText, aiInstructions),
    );
    saveQueueRef.current = run;
    return run;
  };

  const writeContent = async (
    contentJson: string,
    plainText: string,
    aiInstructions?: string,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await gqlClient.request(UPDATE_CONTENT_MUTATION, {
        input: {
          draftId,
          contentJson,
          plainText,
          ...(aiInstructions !== undefined && { aiInstructions }),
        },
      });
      setLastSaved(new Date());
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
      // The resume's saved match and ATS result are stale once its text changes;
      // refetch so the Resumes list shows the reminder instead of a cached "up to
      // date" result.
      void queryClient.invalidateQueries({ queryKey: resumeMatchesQueryKey(applicationId) });
      void queryClient.invalidateQueries({ queryKey: resumeAtsScoresQueryKey(applicationId) });
      return true;
    } catch (err) {
      console.error('Failed to save:', err);
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
  const handleAiSave = (contentJson: string, plainText: string, aiInstructions: string) => {
    // The editor is already showing the result: count it as the text even if the
    // save fails, and keep the failure visible with a way to retry.
    setLiveText(plainText);
    aiInstructionsRef.current = aiInstructions;
    const save = saveContent(contentJson, plainText, aiInstructions);
    trackSave(save);
    void save.then((ok) => setAiUnsaved(!ok));
    return save;
  };

  // An imported document is saved like an AI result, keeping the prompt as it was.
  const handleImportSave = (contentJson: string, plainText: string) =>
    handleAiSave(contentJson, plainText, aiInstructionsRef.current ?? draft?.aiInstructions ?? '');

  const retryAiSave = () => {
    const editor = editorRef.current;
    if (!editor) return;
    void handleAiSave(editor.getJson(), editor.getText(), aiInstructionsRef.current ?? '');
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

  const typeLabel =
    draft?.type === 'cover_letter' ? t('documents.cover_letter') : t('documents.resume');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {t('documentDraftEdit.loadingDraft')}
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-red-600">{t('documentDraftEdit.draftNotFound')}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconButton
            label={t('documentDraftEdit.backAria')}
            icon={<ArrowLeftIcon className="size-5" />}
            onClick={() =>
              navigate({ to: '/applications/$applicationId', params: { applicationId } })
            }
          />
          <div className="min-w-0">
            <DraftTitleField title={draft.title} placeholder={typeLabel} onCommit={renameTitle} />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {typeLabel}
              {lastSaved && (
                <span className="ml-2">
                  · {t('documentDraftEdit.savedAt', { time: lastSaved.toLocaleTimeString() })}
                </span>
              )}
              {saving && <span className="ml-2 text-blue-600">{t('applicationForm.saving')}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportPdf} disabled={exporting}>
            <span className="inline-flex items-center gap-1.5">
              <DownloadIcon className="size-4" />
              {exporting ? t('documentDraftEdit.exporting') : t('documentDraftEdit.exportPdf')}
            </span>
          </Button>
          <IconButton
            label={t('common.delete')}
            icon={<TrashIcon className="size-4" />}
            variant="danger"
            onClick={handleDelete}
          />
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {aiUnsaved && (
        <Alert className="mb-4">
          {t('documentDraftEdit.aiUnsaved')}{' '}
          <button type="button" className="font-medium underline" onClick={retryAiSave}>
            {t('documentDraftEdit.retrySave')}
          </button>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <DocumentDraftEditor
          contentJson={draft.contentJson}
          onUpdate={handleUpdate}
          flushRef={flushEditorRef}
          editorRef={editorRef}
          onTextChange={setLiveText}
        />
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {liveText.trim() === '' && (
            <ImportDocumentAction
              applicationId={applicationId}
              editorRef={editorRef}
              onSave={handleImportSave}
            />
          )}
          <AiHelperPanel
            draftId={draft.id}
            applicationId={applicationId}
            type={draft.type === 'cover_letter' ? 'cover_letter' : 'resume'}
            plainText={liveText}
            initialInstructions={draft.aiInstructions}
            editorRef={editorRef}
            onSave={handleAiSave}
          />
        </div>
      </div>
    </div>
  );
}
