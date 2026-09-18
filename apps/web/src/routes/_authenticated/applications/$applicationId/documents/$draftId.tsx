import { useState, useEffect, useRef } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { downloadUrl } from '#/lib/downloadUrl';
import { DocumentDraftEditor } from '../-components/DocumentDraftEditor';
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

export function DocumentDraftEditPage() {
  const { t } = useLocale();
  const { applicationId, draftId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The editor debounces saves, and a save can still be on the wire when the
  // user clicks Export — which renders what the server has, not what is on
  // screen. Export flushes the first and waits out the second.
  const flushEditorRef = useRef<(() => void) | null>(null);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  const [draft, setDraft] = useState<{
    id: string;
    type: string;
    title: string;
    contentJson: string;
    plainText: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const commitRename = async () => {
    const title = titleDraft.trim();
    setRenaming(false);
    // An unchanged or emptied title is a no-op rather than an error: the user
    // clicked away, they did not ask for anything.
    if (!title || !draft || title === draft.title) return;
    const previous = draft.title;
    setDraft({ ...draft, title });
    try {
      await gqlClient.request(RENAME_DRAFT_MUTATION, { draftId, title });
    } catch (err) {
      setDraft((d) => (d ? { ...d, title: previous } : d));
      setError(getErrorMessage(err));
    }
  };

  useEffect(() => {
    gqlClient
      .request<{ documentDraft: typeof draft }>(DRAFT_QUERY, { id: draftId })
      .then((res) => setDraft(res.documentDraft))
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('documentDraftEdit.loadFailed')),
      )
      .finally(() => setLoading(false));
  }, [draftId, t]);

  const saveContent = async (contentJson: string, plainText: string): Promise<boolean> => {
    setSaving(true);
    try {
      await gqlClient.request(UPDATE_CONTENT_MUTATION, {
        input: { draftId, contentJson, plainText },
      });
      setLastSaved(new Date());
      setDraft((prev) => (prev ? { ...prev, contentJson, plainText } : prev));
      return true;
    } catch (err) {
      console.error('Failed to save:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = (contentJson: string, plainText: string) => {
    const save = saveContent(contentJson, plainText);
    pendingSaveRef.current = save;
    void save.finally(() => {
      if (pendingSaveRef.current === save) pendingSaveRef.current = null;
    });
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
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconButton
            label={t('documentDraftEdit.backAria')}
            icon={<ArrowLeftIcon className="size-5" />}
            onClick={() =>
              navigate({ to: '/applications/$applicationId', params: { applicationId } })
            }
          />
          <div>
            {renaming ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                aria-label={t('documentDraftEdit.renameAria')}
                className="border-b border-blue-500 bg-transparent text-xl font-bold text-gray-900 outline-none dark:text-gray-100"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(draft.title);
                  setRenaming(true);
                }}
                title={t('documentDraftEdit.renameAria')}
                className="text-left text-xl font-bold text-gray-900 hover:underline dark:text-gray-100"
              >
                {draft.title}
              </button>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {draft.type === 'cover_letter' ? t('documents.cover_letter') : t('documents.resume')}
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

      <DocumentDraftEditor
        contentJson={draft.contentJson}
        onUpdate={handleUpdate}
        flushRef={flushEditorRef}
      />
    </div>
  );
}
