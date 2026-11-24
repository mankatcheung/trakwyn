import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckIcon, ChevronRightIcon, EditIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { Modal } from '@trakwyn/ui';
import { APPLICATION_STATUSES, statusColor } from '#/features/applications/lib/statusColors';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

interface ApplicationActionsSheetProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  starred: boolean;
  status: string;
  onToggleStar: () => void;
  onChangeStatus: (status: ApplicationStatus) => void;
  onDelete: () => void;
}

const ROW_HEIGHT = { minHeight: '56px' } as const;

const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-3.5 px-5 text-left text-[15px] text-stone-900 transition-colors hover:bg-stone-50 dark:text-stone-100 dark:hover:bg-stone-700/50';

/**
 * The application's own actions, as labelled rows: each is a 56px tap
 * target with a text label, not an icon-only button — icon buttons sharing
 * the header row with the company name fall under the 44px minimum tap
 * target and give no indication what they do.
 */
export function ApplicationActionsSheet({
  open,
  onClose,
  applicationId,
  starred,
  status,
  onToggleStar,
  onChangeStatus,
  onDelete,
}: ApplicationActionsSheetProps) {
  const { t } = useLocale();
  // Status is the one action with a choice attached, so it opens a second pane
  // in the same sheet rather than a second dialog on top of this one.
  const [pane, setPane] = useState<'actions' | 'status'>('actions');

  useEffect(() => {
    if (!open) setPane('actions');
  }, [open]);

  const statusLabel = (value: string) => t(`status.${value}`, { defaultValue: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      position="bottom"
      ariaLabel={t(
        pane === 'status' ? 'applicationDetail.changeStatus' : 'applicationDetail.moreActions',
      )}
    >
      <div className="flex flex-col pb-2">
        <div className="flex justify-center py-2.5">
          <div className="h-1 w-9 rounded-full bg-stone-200 dark:bg-stone-600" />
        </div>

        {pane === 'actions' ? (
          <>
            <button
              type="button"
              onClick={() => {
                onToggleStar();
                onClose();
              }}
              className={ROW_CLASS}
              style={ROW_HEIGHT}
            >
              <StarIcon
                size={20}
                className={starred ? 'fill-yellow-400 text-yellow-400' : 'text-stone-500'}
              />
              <span className="flex-1">
                {t(starred ? 'applications.unstar' : 'applications.star')}
              </span>
            </button>

            <Link
              to="/applications/$applicationId/edit"
              params={{ applicationId }}
              onClick={onClose}
              className={ROW_CLASS}
              style={ROW_HEIGHT}
            >
              <EditIcon size={20} className="text-stone-500" />
              <span className="flex-1">{t('common.edit')}</span>
            </Link>

            <button
              type="button"
              onClick={() => setPane('status')}
              className={ROW_CLASS}
              style={ROW_HEIGHT}
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${statusColor(status).dot}`}
                aria-hidden="true"
              />
              <span className="flex-1">{t('applicationDetail.changeStatus')}</span>
              <span className="text-sm text-stone-400">{statusLabel(status)}</span>
              <ChevronRightIcon size={16} className="text-stone-300" />
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete();
              }}
              className="flex w-full cursor-pointer items-center gap-3.5 border-t border-stone-100 px-5 text-left text-[15px] text-red-600 transition-colors hover:bg-red-50 dark:border-stone-700 dark:text-red-400 dark:hover:bg-red-900/20"
              style={ROW_HEIGHT}
            >
              <Trash2Icon size={20} />
              <span className="flex-1">{t('applicationDetail.deleteApplicationTitle')}</span>
            </button>
          </>
        ) : (
          APPLICATION_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value !== status) onChangeStatus(value);
                onClose();
              }}
              aria-current={value === status ? 'true' : undefined}
              className={ROW_CLASS}
              style={ROW_HEIGHT}
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${statusColor(value).dot}`}
                aria-hidden="true"
              />
              <span className="flex-1">{statusLabel(value)}</span>
              {value === status && (
                <CheckIcon size={18} className="text-blue-800 dark:text-blue-400" />
              )}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
