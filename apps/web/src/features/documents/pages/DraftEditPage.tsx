import { useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { DownloadIcon, TrashIcon, ArrowLeftIcon, HistoryIcon } from 'lucide-react';
import { Alert, Button, IconButton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useDocumentLanguage } from '../lib/editor/documentLanguage';
import { useDraftEditor } from '../hooks/useDraftEditor';
import { DocumentDraftEditor } from '../components/editor/DocumentDraftEditor';
import { AiHelperPanel } from '../components/AiHelperPanel';
import { DocumentEditorChecks } from '../components/editor/DocumentEditorChecks';
import { DraftHistoryPanel } from '../components/DraftHistoryPanel';
import { DraftTitleField } from '../components/DraftTitleField';
import { ImportDocumentAction } from '../components/ImportDocumentAction';

const route = getRouteApi('/_authenticated/applications/$applicationId/documents/$draftId');

export function DraftEditPage() {
  const { t, locale } = useLocale();
  const { applicationId, draftId } = route.useParams();
  // The spell-check language of this draft (JEF-579): the app's language until one is chosen.
  const [documentLanguage, setDocumentLanguage] = useDocumentLanguage(draftId, locale);
  const navigate = useNavigate();
  // Draft history (JEF-584): whether the panel is open.
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
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
  } = useDraftEditor(applicationId, draftId);

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
          <IconButton
            label={t('draftHistory.open')}
            icon={<HistoryIcon className="size-4" />}
            aria-pressed={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          />
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
        <div className="min-w-0">
          <DocumentDraftEditor
            contentJson={draft.contentJson}
            onUpdate={handleUpdate}
            flushRef={flushEditorRef}
            editorRef={editorRef}
            onTextChange={(text) => {
              setLiveText(text);
              setDirty(true);
            }}
            onJsonChange={setLiveJson}
            draftType={draft.type === 'cover_letter' ? 'cover_letter' : 'resume'}
            inlineAi={{ draftId: draft.id, onApplied: handleInlineAiApplied }}
            language={{ value: documentLanguage, onChange: setDocumentLanguage }}
            saveStatus={{
              state: saveState,
              errorMessage: saveFailure?.message,
              // An AI result that failed to save is retried with its AI flags, as in the alert above.
              onRetry: aiUnsaved ? retryAiSave : retryContentSave,
            }}
          />
          {draft.type === 'resume' && (
            <DocumentEditorChecks
              contentJson={liveJson}
              onJump={(index) => editorRef.current?.focusBlock(index)}
            />
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {liveText.trim() === '' && (
            <ImportDocumentAction
              applicationId={applicationId}
              editorRef={editorRef}
              onSave={handleImportSave}
            />
          )}
          {historyOpen && (
            <DraftHistoryPanel
              draftId={draft.id}
              prepare={settleSaves}
              onRestored={handleRestored}
              refreshKey={saveCount}
            />
          )}
          <AiHelperPanel
            draftId={draft.id}
            applicationId={applicationId}
            type={draft.type === 'cover_letter' ? 'cover_letter' : 'resume'}
            plainText={liveText}
            initialInstructions={draft.aiInstructions}
            initialAiGenerated={draft.aiGenerated}
            initialRating={draft.myRating}
            editorRef={editorRef}
            onSave={handleAiSave}
          />
        </div>
      </div>
    </div>
  );
}
