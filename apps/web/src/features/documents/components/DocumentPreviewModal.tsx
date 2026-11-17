import { XIcon, ExternalLinkIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { IconButton, Modal } from '@trakwyn/ui';

const PREVIEWABLE_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export function isPreviewableMimeType(mimeType: string): boolean {
  return PREVIEWABLE_MIME_TYPES.includes(mimeType);
}

export interface PreviewableDocument {
  name: string;
  mimeType: string;
  url: string;
}

interface DocumentPreviewModalProps {
  document: PreviewableDocument | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ document: doc, onClose }: DocumentPreviewModalProps) {
  const { t } = useLocale();
  if (!doc) return null;

  const isPdf = doc.mimeType === 'application/pdf';
  const isImage = doc.mimeType === 'image/png' || doc.mimeType === 'image/jpeg';

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="flex h-[80vh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {doc.name}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title={t('documents.openInNewTab')}
            >
              <ExternalLinkIcon size={16} />
            </a>
            <IconButton label={t('common.close')} icon={<XIcon size={16} />} onClick={onClose} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {isPdf ? (
            <iframe src={doc.url} title={doc.name} className="size-full border-0" />
          ) : isImage ? (
            <div className="flex size-full items-center justify-center p-4">
              <img src={doc.url} alt={doc.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('documentPreview.noPreviewAvailable')}
              </p>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t('documentPreview.openDocument', { name: doc.name })}
              </a>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
