import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon, UploadIcon } from 'lucide-react';
import { showUndoToast } from '#/lib/undoToast';
import { storageUsageQueryKey, useStorageUsage } from '#/lib/storageUsage';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { useLocale } from '#/lib/i18n';
import { documentCategory, type DocumentCategory } from '#/lib/documentCategory';
import {
  buildListItems,
  countItems,
  effectiveFilter,
  filterItems,
  type ListFilter,
} from '#/lib/documentListItems';
import { EmptyState } from '@trakwyn/ui';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DraftRow, FileRow } from './DocumentListRow';
import { CreateDraftButton } from './CreateDraftButton';
import { DocumentUploadPanel, StorageLeft } from './DocumentUploadPanel';
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

const UPLOAD_CLASS =
  'flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

const FILTERS: readonly { id: ListFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'documents.filterAll' },
  { id: 'drafts', labelKey: 'documents.filterDrafts' },
  { id: 'files', labelKey: 'documents.filterFiles' },
];

interface DocumentListProps {
  applicationId: string;
  /** Only this category's drafts and uploads are shown — no tab overlaps another. */
  category: DocumentCategory;
}

/**
 * One list for all three document tabs. Cover letters and Resumes can start a
 * draft ("Create new" opens the editor, JEF-506); Other
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
        qc.invalidateQueries({ queryKey: storageUsageQueryKey });
      },
    });
  };

  const storage = useStorageUsage();
  const { onTrakwynAi } = useAiCredits();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<ListFilter>('all');

  const items = useMemo(() => buildListItems(drafts, docs), [drafts, docs]);
  const counts = countItems(items);
  const activeFilter = effectiveFilter(filter, counts);
  const visible = filterItems(items, activeFilter);
  const withMatch = category === 'resume';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* What is left, once, instead of in every row (JEF-510). Under the buttons on a phone. */}
        <div className="order-last flex min-w-0 flex-col gap-0.5 sm:order-first">
          {storage && <StorageLeft usage={storage} />}
          {category === 'resume' && onTrakwynAi && items.length > 0 && (
            <AiCreditsMeter variant="inline" />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className={UPLOAD_CLASS}
          >
            <UploadIcon size={16} aria-hidden="true" />
            {t('documents.uploadFile')}
          </button>
          {category !== 'other' && (
            <CreateDraftButton
              applicationId={applicationId}
              type={category}
              drafts={draftsData?.documentDrafts ?? []}
            />
          )}
        </div>
      </div>

      {counts.drafts > 0 && counts.files > 0 && (
        <div
          role="group"
          aria-label={t('documents.filterLabel')}
          className="flex w-full rounded-[10px] bg-gray-200 p-[3px] dark:bg-gray-700"
        >
          {FILTERS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeFilter === id}
              onClick={() => setFilter(id)}
              className={`min-h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-sm whitespace-nowrap transition-colors ${
                activeFilter === id
                  ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {t(labelKey)} {counts[id]}
            </button>
          ))}
        </div>
      )}
      <DocumentUploadPanel
        applicationId={applicationId}
        category={category}
        inputRef={uploadInputRef}
        showStorage={false}
      />

      {visible.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {visible.map((item) =>
            item.kind === 'draft' ? (
              <DraftRow
                key={item.key}
                applicationId={applicationId}
                draft={item.draft}
                withMatch={withMatch}
                onDelete={deleteDraft}
              />
            ) : (
              <FileRow
                key={item.key}
                applicationId={applicationId}
                document={item.document}
                withMatch={withMatch}
                showPortfolioBadge={category === 'other'}
                onPreview={setPreviewDoc}
                onDelete={deleteDocument}
              />
            ),
          )}
        </ul>
      )}

      {draftsLoaded && docsLoaded && items.length === 0 && (
        <EmptyState icon={<FileTextIcon size={32} />} message={t(EMPTY_MESSAGE_KEY[category])} />
      )}
      <DocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
