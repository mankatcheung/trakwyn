import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeftIcon, EditIcon, MoreHorizontalIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { Menu, type MenuItem } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { APPLICATION_STATUSES, statusColor } from '#/lib/statusColors';
import type { ApplicationStatus } from '#/graphql/generated/graphql';

/** The 44px "…" trigger, shared with the phone's sheet so the header never shifts. */
export const ACTIONS_TRIGGER_CLASS =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700';

const STATUS_PREFIX = 'status:';

interface ApplicationActionsMenuProps {
  applicationId: string;
  starred: boolean;
  status: string;
  onToggleStar: () => void;
  onChangeStatus: (status: ApplicationStatus) => void;
  onDelete: () => void;
}

/**
 * The application's actions as a popover anchored to the "…" button, for wide
 * screens (JEF-404). The same actions as `ApplicationActionsSheet`, which
 * stays the phone's version: a sheet pinned to the bottom of a wide window is
 * far from the button that opened it and dims the page behind four rows.
 *
 * Change status opens a second pane in the same popover, as it does in the
 * sheet, rather than a flyout to the side — a flyout needs hover handling and
 * collision checks, and works badly on a touch laptop.
 */
export function ApplicationActionsMenu({
  applicationId,
  starred,
  status,
  onToggleStar,
  onChangeStatus,
  onDelete,
}: ApplicationActionsMenuProps) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [pane, setPane] = useState<'actions' | 'status'>('actions');

  const statusLabel = (value: string) => t(`status.${value}`, { defaultValue: value });

  const actionItems: MenuItem[] = [
    {
      id: 'star',
      label: t(starred ? 'applications.unstar' : 'applications.star'),
      icon: (
        <StarIcon
          size={16}
          className={starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-500'}
        />
      ),
    },
    { id: 'edit', label: t('common.edit'), icon: <EditIcon size={16} className="text-gray-500" /> },
    {
      id: 'status',
      label: t('applicationDetail.changeStatus'),
      icon: (
        <span
          className={`size-2.5 shrink-0 rounded-full ${statusColor(status).dot}`}
          aria-hidden="true"
        />
      ),
      keepOpen: true,
    },
    {
      id: 'delete',
      label: t('applicationDetail.deleteApplicationTitle'),
      icon: <Trash2Icon size={16} />,
      destructive: true,
      separated: true,
    },
  ];

  const statusItems: MenuItem[] = [
    {
      id: 'back',
      label: t('applicationDetail.changeStatus'),
      icon: <ChevronLeftIcon size={16} className="text-gray-500" />,
      keepOpen: true,
    },
    ...APPLICATION_STATUSES.map((value, index) => ({
      id: `${STATUS_PREFIX}${value}`,
      label: statusLabel(value),
      icon: (
        <span
          className={`size-2.5 shrink-0 rounded-full ${statusColor(value).dot}`}
          aria-hidden="true"
        />
      ),
      current: value === status,
      separated: index === 0,
    })),
  ];

  const onSelect = (id: string) => {
    if (id === 'status') setPane('status');
    else if (id === 'back') setPane('actions');
    else if (id.startsWith(STATUS_PREFIX)) {
      const next = id.slice(STATUS_PREFIX.length) as ApplicationStatus;
      if (next !== status) onChangeStatus(next);
    } else if (id === 'star') onToggleStar();
    else if (id === 'edit') {
      void navigate({ to: '/applications/$applicationId/edit', params: { applicationId } });
    } else if (id === 'delete') onDelete();
  };

  return (
    <Menu
      label={t(
        pane === 'status' ? 'applicationDetail.changeStatus' : 'applicationDetail.moreActions',
      )}
      breakpoint="md"
      items={pane === 'status' ? statusItems : actionItems}
      onSelect={onSelect}
      onClose={() => setPane('actions')}
      trigger={(triggerProps) => (
        <button
          type="button"
          {...triggerProps}
          aria-label={t('applicationDetail.moreActions')}
          className={ACTIONS_TRIGGER_CLASS}
        >
          <MoreHorizontalIcon size={20} />
        </button>
      )}
    />
  );
}
