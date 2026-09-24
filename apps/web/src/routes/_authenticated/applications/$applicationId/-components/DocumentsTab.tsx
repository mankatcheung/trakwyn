import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { put as putBlob } from '@vercel/blob/client';
import { CheckIcon, ExternalLinkIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { showUndoToast } from '#/lib/undoToast';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Button, Card, FormLabel, Input, Select } from '@trakwyn/ui';
import { DocumentPreviewModal, isPreviewableMimeType } from './DocumentPreviewModal';
import { invalidateSectionCounts } from '../-sectionCounts';
import {
  reportStorageFailure,
  uploadProviderOf,
  type UploadProvider,
} from './documentUploadReporting';

export const DOCUMENTS_QUERY = `
  query Documents($applicationId: ID!) {
    documents(applicationId: $applicationId) { id applicationId name mimeType sizeBytes url documentType version createdAt }
  }
`;
const REQUEST_UPLOAD_URL = `
  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {
    requestUploadUrl(input: $input) { uploadUrl storageKey }
  }
`;
const CONFIRM_DOCUMENT = `
  mutation ConfirmDocument($input: ConfirmDocumentInput!) {
    confirmDocument(input: $input) { id applicationId name mimeType sizeBytes url documentType version createdAt }
  }
`;
const DELETE_DOCUMENT = `mutation DeleteDocument($id: ID!) { deleteDocument(id: $id) }`;

const DOCUMENT_DRAFTS_QUERY = `
  query DocumentDrafts($applicationId: ID!) {
    documentDrafts(applicationId: $applicationId) {
      id
      applicationId
      type
      title
      createdAt
      updatedAt
    }
  }
`;
const DELETE_DRAFT = `mutation DeleteDocumentDraft($id: ID!) { deleteDocumentDraft(id: $id) }`;

type DocumentDraft = {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type Document = {
  id: string;
  applicationId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  documentType: string;
  version?: string | null;
  createdAt: string;
};

type PendingUpload = {
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

const DOC_TYPE_BADGE: Record<string, string> = {
  resume: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cover_letter: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  portfolio: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export function DocumentsTab({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [docType, setDocType] = useState('other');
  const [docVersion, setDocVersion] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  const { data: draftsData } = useQuery({
    queryKey: ['documentDrafts', applicationId],
    queryFn: () =>
      gqlClient.request<{ documentDrafts: DocumentDraft[] }>(DOCUMENT_DRAFTS_QUERY, {
        applicationId,
      }),
  });
  const { data } = useQuery({
    queryKey: ['documents', applicationId],
    queryFn: () => gqlClient.request<{ documents: Document[] }>(DOCUMENTS_QUERY, { applicationId }),
  });
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    // Set once the upload URL is in hand. Until then any failure was thrown
    // by gqlClient, which has already reported what deserves reporting —
    // see documentUploadReporting.ts.
    let storageProvider: UploadProvider | null = null;
    try {
      const { requestUploadUrl } = await gqlClient.request<{
        requestUploadUrl: { uploadUrl: string; storageKey: string };
      }>(REQUEST_UPLOAD_URL, {
        input: { applicationId, filename: file.name, mimeType: file.type },
      });

      storageProvider = uploadProviderOf(requestUploadUrl.uploadUrl);
      if (storageProvider === 'local') {
        const response = await fetch(requestUploadUrl.uploadUrl, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) throw new Error('Local upload failed');
      } else {
        // `uploadUrl` is a Vercel Blob client token (not a fetchable URL) —
        // put() uploads directly to Blob storage, bypassing our API.
        await putBlob(requestUploadUrl.storageKey, file, {
          access: 'public',
          token: requestUploadUrl.uploadUrl,
          contentType: file.type,
        });
      }

      setPendingUpload({
        storageKey: requestUploadUrl.storageKey,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      setDocType('other');
      setDocVersion('');
    } catch (err) {
      setUploadError(getErrorMessage(err));
      if (storageProvider) reportStorageFailure(err, { provider: storageProvider, file });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!pendingUpload) return;
    setConfirming(true);
    try {
      await gqlClient.request(CONFIRM_DOCUMENT, {
        input: {
          applicationId,
          storageKey: pendingUpload.storageKey,
          name: pendingUpload.name,
          mimeType: pendingUpload.mimeType,
          sizeBytes: pendingUpload.sizeBytes,
          documentType: docType,
          ...(docVersion.trim() ? { version: docVersion.trim() } : {}),
        },
      });
      captureEvent(ANALYTICS_EVENTS.DOCUMENT_UPLOADED, {
        document_type: docType,
        mime_type: pendingUpload.mimeType,
      });
      qc.invalidateQueries({ queryKey: ['documents', applicationId] });
      invalidateSectionCounts(qc, applicationId);
      setPendingUpload(null);
    } catch (err) {
      // Only confirmDocument can throw here, and gqlClient reports its 5xx
      // and network failures itself; reporting again would double them.
      setUploadError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  const docs = data?.documents ?? [];
  const drafts = draftsData?.documentDrafts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link
          to="/applications/$applicationId/documents/new"
          params={{ applicationId }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <PlusIcon size={14} /> <span className="hidden sm:inline">{t('documents.newDraft')}</span>
        </Link>
      </div>

      {drafts.length > 0 && (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <Card key={draft.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <Link
                  to="/applications/$applicationId/documents/$draftId"
                  params={{ applicationId, draftId: draft.id }}
                  className="block truncate text-sm font-medium text-blue-600 hover:underline"
                >
                  {draft.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${draft.type === 'cover_letter' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}
                  >
                    {draft.type === 'cover_letter'
                      ? t('documents.cover_letter')
                      : t('documents.resume')}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(draft.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  const snapshot = qc.getQueryData<{ documentDrafts: DocumentDraft[] }>([
                    'documentDrafts',
                    applicationId,
                  ]);
                  qc.setQueryData<{ documentDrafts: DocumentDraft[] }>(
                    ['documentDrafts', applicationId],
                    (prev) => ({
                      documentDrafts: (prev?.documentDrafts ?? []).filter((d) => d.id !== draft.id),
                    }),
                  );
                  showUndoToast({
                    message: t('documents.draftDeletedToast'),
                    operation: { document: DELETE_DRAFT, variables: { id: draft.id } },
                    onUndo: () => qc.setQueryData(['documentDrafts', applicationId], snapshot),
                    onSettled: () => {
                      qc.invalidateQueries({ queryKey: ['documentDrafts', applicationId] });
                      invalidateSectionCounts(qc, applicationId);
                    },
                  });
                }}
                className="shrink-0 rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <Trash2Icon size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {!pendingUpload && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-gray-600 dark:bg-gray-800">
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {uploading ? (
                <span>{t('documents.uploading')}</span>
              ) : (
                <>
                  <span className="font-medium text-blue-600 hover:underline">
                    {t('documents.clickToUpload')}
                  </span>{' '}
                  {t('documents.uploadPromptSuffix')}
                </>
              )}
            </div>
          </label>
          {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
        </div>
      )}

      {pendingUpload && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t('documents.uploaded')}{' '}
            <span className="font-normal text-gray-600 dark:text-gray-400">
              {pendingUpload.name}
            </span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FormLabel size="xs">{t('documents.documentTypeLabel')}</FormLabel>
              <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="other">{t('documents.other')}</option>
                <option value="resume">{t('documents.resume')}</option>
                <option value="cover_letter">{t('documents.cover_letter')}</option>
                <option value="portfolio">{t('documents.portfolio')}</option>
              </Select>
            </div>
            <div>
              <FormLabel size="xs">
                {t('documents.versionLabel')}{' '}
                <span className="font-normal">({t('common.optional')})</span>
              </FormLabel>
              <Input
                value={docVersion}
                onChange={(e) => setDocVersion(e.target.value)}
                placeholder={t('documents.versionPlaceholder')}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={confirming}
              aria-label={t('documents.confirmUpload')}
            >
              <span className="flex items-center gap-1">
                <CheckIcon size={14} />{' '}
                <span className="hidden sm:inline">
                  {confirming ? t('applicationForm.saving') : t('documents.confirmUpload')}
                </span>
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingUpload(null)}
              aria-label={t('common.cancel')}
            >
              <span className="flex items-center gap-1">
                <XIcon size={14} /> <span className="hidden sm:inline">{t('common.cancel')}</span>
              </span>
            </Button>
          </div>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      )}

      {docs.map((doc) => (
        <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
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
              {doc.documentType !== 'other' && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOC_TYPE_BADGE[doc.documentType] ?? ''}`}
                >
                  {t(`documents.${doc.documentType}`, { defaultValue: doc.documentType })}
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
              onClick={() => {
                const snapshot = qc.getQueryData<{ documents: Document[] }>([
                  'documents',
                  applicationId,
                ]);
                qc.setQueryData<{ documents: Document[] }>(
                  ['documents', applicationId],
                  (prev) => ({
                    documents: (prev?.documents ?? []).filter((d) => d.id !== doc.id),
                  }),
                );
                showUndoToast({
                  message: t('documents.documentDeletedToast'),
                  operation: { document: DELETE_DOCUMENT, variables: { id: doc.id } },
                  onUndo: () => qc.setQueryData(['documents', applicationId], snapshot),
                  onSettled: () => {
                    qc.invalidateQueries({ queryKey: ['documents', applicationId] });
                    invalidateSectionCounts(qc, applicationId);
                  },
                });
              }}
              className="rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            >
              <Trash2Icon size={14} />
            </button>
          </div>
        </Card>
      ))}
      <DocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
