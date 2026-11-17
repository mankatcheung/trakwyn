import { useLocale } from '#/lib/i18n';
import { Modal } from '@trakwyn/ui';
import { AlertTriangleIcon } from 'lucide-react';

interface EmptyTrashDialogProps {
  open: boolean;
  count: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation for the most destructive button in the product: it removes
 * every application in Trash and its uploaded files, skipping the retention
 * window that Trash exists to provide.
 *
 * Two deliberate details. The count is in the copy, so the sentence the user
 * reads is about their data rather than a generic warning. And the dialog is
 * rendered without a `title`, which makes Cancel the first focusable element —
 * `Modal` focuses that on open, so a stray Enter dismisses instead of
 * destroying. Confirming takes a real click, or Tab first.
 */
export function EmptyTrashDialog({
  open,
  count,
  isPending,
  onCancel,
  onConfirm,
}: EmptyTrashDialogProps) {
  const { t } = useLocale();

  return (
    <Modal open={open} onClose={onCancel} size="sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon size={20} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {t('trash.emptyTrashConfirmTitle', { count })}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('trash.emptyTrashConfirmBody')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {/* Cancel first in DOM order — see the note above about focus. */}
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {t('trash.emptyTrashConfirmAction', { count })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
