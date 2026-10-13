import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLinkIcon, FileTextIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { showUndoToast } from '#/lib/undoToast';
import { useLocale } from '#/lib/i18n';
import { documentCategory, type DocumentCategory } from '#/lib/documentCategory';
import { Button, Card, EmptyState } from '@trakwyn/ui';
import { DocumentPreviewModal, isPreviewableMimeType } from './DocumentPreviewModal';
import { DocumentUploadPanel } from './DocumentUploadPanel';
import { ResumeMatchPanel } from './ResumeMatchPanel';
import { invalidateSectionCounts } from '../-sectionCounts';
import {
  documentDraftsQueryKey,
  documentDraftsQueryOptions,
  documentsQueryKey,
  documentsQueryOptions,
  type Document,
  type DocumentDraft,
} from '../-documentQueries';

const DELETE_DOCUMENT = `mutation DeleteDocument($id: ID!) { deleteDocument(id: $id) }`;
const DELETE_DRAFT = `mutation DeleteDocumentDraft($id: ID!) { deleteDocumentDraft(id: $id) }`;

const EMPTY_MESSAGE_KEY: Record<DocumentCategory, string> = {
  cover_letter: 'documents.emptyCoverLetters',
  resume: 'documents.emptyResumes',
  other: 'documents.emptyOther',
};

const NEW_DRAFT_CLASS =
  'flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700';

interface DocumentListProps {
  applicationId: string;
  /** Only this category's drafts and uploads are shown — no tab overlaps another. */
  category: DocumentCategory;
}

/**
 * One list for all three document tabs. Cover letters and Resumes can start a
 * draft (each through its own form, so the type is never asked for); Other
 * documents is upload-only.
 */
export function DocumentList({ applicationId, category }: DocumentListProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  const { data: draftsData, isSuccess: draftsLoaded } = useQuery(
    documentDraftsQueryOptions(applicationId),
  );
  const { data, isSuccess: docsLoaded } = useQuery(documentsQueryOptions(applicationId));

  const docs = (data?.documents ?? []).filter((d) => documentCategory(d.documentType) === category);
  const drafts = (draftsData?.documentDrafts ?? []).filter(
    (d) => documentCategory(d.type) === category,
  );

  const deleteDraft = (draft: DocumentDraft) => {
    const key = documentDraftsQueryKey(applicationId);
    const snapshot = qc.getQueryData<{ documentDrafts: DocumentDraft[] }>(key);
    qc.setQueryData<{ documentDrafts: DocumentDraft[] }>(key, (prev) => ({
      documentDrafts: (prev?.documentDrafts ?? []).filter((d) => d.id !== draft.id),
    }));
    showUndoToast({
      message: t('documents.draftDeletedToast'),
      operation: { document: DELETE_DRAFT, variables: { id: draft.id } },
      onUndo: () => qc.setQueryData(key, snapshot),
      onSettled: () => {
        qc.invalidateQueries({ queryKey: key });
        invalidateSectionCounts(qc, applicationId);
      },
    });
  };

  const deleteDocument = (doc: Document) => {
    const key = documentsQueryKey(applicationId);
    const snapshot = qc.getQueryData<{ documents: Document[] }>(key);
    qc.setQueryData<{ documents: Document[] }>(key, (prev) => ({
      documents: (prev?.documents ?? []).filter((d) => d.id !== doc.id),
    }));
    showUndoToast({
      message: t('documents.documentDeletedToast'),
      operation: { document: DELETE_DOCUMENT, variables: { id: doc.id } },
      onUndo: () => qc.setQueryData(key, snapshot),
      onSettled: () => {
        qc.invalidateQueries({ queryKey: key });
        invalidateSectionCounts(qc, applicationId);
      },
    });
  };

  const newDraftLabel = (
    <>
      <PlusIcon size={14} /> <span className="hidden sm:inline">{t('documents.newDraft')}</span>
    </>
  );

  return (
    <div className="space-y-4">
      {category === 'cover_letter' && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/applications/$applicationId/cover-letters/new"
            params={{ applicationId }}
            className={NEW_DRAFT_CLASS}
          >
            {newDraftLabel}
          </Link>
        </div>
      )}
      {category === 'resume' && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/applications/$applicationId/resumes/new"
            params={{ applicationId }}
            className={NEW_DRAFT_CLASS}
          >
            {newDraftLabel}
          </Link>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <Card key={draft.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <Link
                    to="/applications/$applicationId/documents/$draftId"
                    params={{ applicationId, draftId: draft.id }}
                    className="block truncate text-sm font-medium text-blue-600 hover:underline"
                  >
                    {draft.title}
                  </Link>
                  <span className="text-xs text-gray-400">
                    {new Date(draft.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => deleteDraft(draft)}
                  aria-label={t('common.delete')}
                  className="shrink-0 rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
              {category === 'resume' && (
                <ResumeMatchPanel
                  applicationId={applicationId}
                  resume={{ documentDraftId: draft.id }}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <DocumentUploadPanel applicationId={applicationId} category={category} />

      {docs.map((doc) => (
        <Card key={doc.id} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {isPreviewableMimeType(doc.mimeType) ? (
                  <Button
                    variant="link"
                    onClick={() => setPreviewDoc(doc)}
                    className="truncate text-left"
                  >
                    {doc.name}
                  </Button>
                ) : (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm font-medium text-blue-600 hover:underline"
                  >
                    {doc.name}
                  </a>
                )}
                {category === 'other' && doc.documentType === 'portfolio' && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {t('documents.portfolio')}
                  </span>
                )}
                {doc.version && <span className="text-xs text-gray-400">{doc.version}</span>}
              </div>
              <p className="text-xs text-gray-400">
                {doc.mimeType} · {(doc.sizeBytes / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-1">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
                title={t('documents.openInNewTab')}
              >
                <ExternalLinkIcon size={14} />
              </a>
              <button
                onClick={() => deleteDocument(doc)}
                aria-label={t('common.delete')}
                className="rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <Trash2Icon size={14} />
              </button>
            </div>
          </div>
          {category === 'resume' && (
            <ResumeMatchPanel applicationId={applicationId} resume={{ documentId: doc.id }} />
          )}
        </Card>
      ))}

      {draftsLoaded && docsLoaded && drafts.length === 0 && docs.length === 0 && (
        <EmptyState icon={<FileTextIcon size={32} />} message={t(EMPTY_MESSAGE_KEY[category])} />
      )}
      <DocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
