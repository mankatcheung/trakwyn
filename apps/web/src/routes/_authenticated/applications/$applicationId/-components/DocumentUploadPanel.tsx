import { useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { put as putBlob } from '@vercel/blob/client';
import { CheckIcon, XIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { ANALYTICS_EVENTS, captureEvent } from '#/lib/analytics';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { UPLOAD_TYPES_BY_CATEGORY, type DocumentCategory } from '#/lib/documentCategory';
import { Button, FormLabel, Input, Select } from '@trakwyn/ui';
import { invalidateSectionCounts } from '../-sectionCounts';
import { documentsQueryKey } from '../-documentQueries';
import {
  reportStorageFailure,
  uploadProviderOf,
  type UploadProvider,
} from './documentUploadReporting';
import { blobAccessOf } from './documentUploadAccess';
import {
  formatStorageSize,
  storageLeftBytes,
  storageLevel,
  storageUsageQueryKey,
  useStorageUsage,
  type StorageUsage,
} from '#/lib/storageUsage';

const REQUEST_UPLOAD_URL = `
  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {
    requestUploadUrl(input: $input) { uploadUrl storageKey access }
  }
`;
const CONFIRM_DOCUMENT = `
  mutation ConfirmDocument($input: ConfirmDocumentInput!) {
    confirmDocument(input: $input) { id applicationId name mimeType sizeBytes url documentType version createdAt }
  }
`;

type PendingUpload = {
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

interface DocumentUploadPanelProps {
  applicationId: string;
  /** Decides the saved type: the tab implies it, so only Other asks. */
  category: DocumentCategory;
  /**
   * The file input is hidden and opened by the list header's "Upload file"
   * button, so the picker has no dropzone of its own taking up the list.
   */
  inputRef: RefObject<HTMLInputElement | null>;
}

export function DocumentUploadPanel({
  applicationId,
  category,
  inputRef,
}: DocumentUploadPanelProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const storage = useStorageUsage();
  const allowedTypes = UPLOAD_TYPES_BY_CATEGORY[category];
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [docType, setDocType] = useState(allowedTypes[0]);
  const [docVersion, setDocVersion] = useState('');
  const [confirming, setConfirming] = useState(false);

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
        requestUploadUrl: { uploadUrl: string; storageKey: string; access?: string | null };
      }>(REQUEST_UPLOAD_URL, {
        input: {
          applicationId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
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
          access: blobAccessOf(requestUploadUrl.access),
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
      setDocType(allowedTypes[0]);
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
      qc.invalidateQueries({ queryKey: documentsQueryKey(applicationId) });
      invalidateSectionCounts(qc, applicationId);
      qc.invalidateQueries({ queryKey: storageUsageQueryKey });
      setPendingUpload(null);
    } catch (err) {
      // Only confirmDocument can throw here, and gqlClient reports its 5xx
      // and network failures itself; reporting again would double them.
      setUploadError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      onChange={handleFileChange}
      disabled={uploading}
      aria-label={t('documents.uploadFile')}
    />
  );

  if (!pendingUpload) {
    return (
      <>
        {fileInput}
        {uploading && (
          <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
            {t('documents.uploading')}
          </p>
        )}
        {storage && <StorageLeft usage={storage} />}
        {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      </>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-700 dark:bg-gray-800">
      {fileInput}
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {t('documents.uploaded')}{' '}
        <span className="font-normal text-gray-600 dark:text-gray-400">{pendingUpload.name}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {allowedTypes.length > 1 && (
          <div>
            <FormLabel size="xs">{t('documents.documentTypeLabel')}</FormLabel>
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {allowedTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`documents.${type}`)}
                </option>
              ))}
            </Select>
          </div>
        )}
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
  );
}

function StorageLeft({ usage }: { usage: StorageUsage }) {
  const { t } = useLocale();
  const level = storageLevel(usage);
  if (level === 'full') {
    return (
      <p role="alert" className="text-xs text-red-600">
        {t('storage.full')}
      </p>
    );
  }
  const color = level === 'warning' ? 'text-amber-600' : 'text-gray-500 dark:text-gray-400';
  return (
    <p className={`text-xs ${color}`}>
      {t('storage.left', { amount: formatStorageSize(storageLeftBytes(usage)) })}
    </p>
  );
}
