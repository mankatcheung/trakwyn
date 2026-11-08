import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useHotkeys } from '#/hooks/useHotkeys';
import { useLocale } from '#/lib/i18n';
import {
  MARK_NOTIFICATIONS_READ,
  NOTIFICATIONS_PAGE_QUERY,
  NOTIFICATION_ICON,
  NotificationRowSkeleton,
  timeAgo,
  type NotificationItem,
  type NotificationsPageResult,
} from './-notification-inbox';

const RECENT_LIMIT = 5;

/**
 * Portaled to `document.body` with a computed fixed position, rather than a
 * plain `absolute` sibling of the trigger — the sidebar header's entrance
 * animation (`sidebar-entrance-item`, `styles.css`) animates transform, which
 * creates a new stacking context for that header. A same-context `absolute`
 * popover was getting visually trapped under the nav list below it (later in
 * DOM order, same top-level stacking) no matter how high its own z-index
 * was — the same class of problem the old backdrop modal already portaled
 * around.
 */
export function NotificationPopover({
  anchorRef,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  // Starts off-screen (not `right`-anchored to the trigger) since the bell
  // sits near the *left* edge of the desktop sidebar, not the right edge of
  // a wide container — anchoring by `right` pushed the whole panel off the
  // left of the viewport. Measuring the panel's real rendered width (fixed
  // by its own `w-80`/`sm:w-96` classes regardless of position) lets this
  // clamp to whichever side actually fits, rather than assuming one.
  const [position, setPosition] = useState({ top: -9999, left: -9999 });

  useHotkeys({ key: 'Escape' }, onClose);

  useLayoutEffect(() => {
    const anchorRect = anchorRef.current?.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!anchorRect || !panelRect) return;
    const margin = 8;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    setPosition({
      top: anchorRect.bottom + margin,
      left: Math.max(margin, Math.min(anchorRect.left, maxLeft)),
    });
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [anchorRef, onClose]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () =>
      gqlClient.request<NotificationsPageResult>(NOTIFICATIONS_PAGE_QUERY, {
        limit: RECENT_LIMIT,
      }),
  });
  const items = data?.notificationsPage.items ?? [];

  const markRead = useMutation({
    mutationFn: ({ ids, isRead }: { ids: string[]; isRead: boolean }) =>
      gqlClient.request(MARK_NOTIFICATIONS_READ, { ids, isRead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onRowClick = (notification: NotificationItem) => {
    if (!notification.read) {
      markRead.mutate({ ids: [notification.id], isRead: true });
    }
    onClose();
    // Not a router `navigate()` — url is a dynamic string, not a typed route —
    // matching how the push-notification-click handler in __root.tsx does it.
    if (notification.url) {
      window.location.href = notification.url;
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('notificationInbox.title')}
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:w-96 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('notificationInbox.title')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && Array.from({ length: 3 }, (_, i) => <NotificationRowSkeleton key={i} />)}
        {isError && (
          <p className="px-4 py-6 text-center text-sm text-red-600">
            {t('notificationInbox.loadFailed')}
          </p>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('notificationInbox.allCaughtUp')}
          </p>
        )}
        {items.map((notification) => (
          <button
            key={notification.id}
            type="button"
            onClick={() => onRowClick(notification)}
            className={`flex w-full items-start gap-2 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50 ${
              notification.read ? '' : 'bg-blue-50/50 dark:bg-blue-900/10'
            }`}
          >
            <span className="mt-0.5 shrink-0">{NOTIFICATION_ICON[notification.type]}</span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm ${
                  notification.read
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'font-semibold text-gray-900 dark:text-gray-100'
                }`}
              >
                {notification.title}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {notification.body}
              </span>
              <span className="mt-1 block text-[11px] text-gray-400">
                {timeAgo(notification.createdAt, t)}
              </span>
            </span>
            {!notification.read && (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      <Link
        to="/notifications"
        onClick={onClose}
        className="shrink-0 border-t border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-blue-600 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-gray-700/50"
      >
        {t('notificationInbox.viewAll')}
      </Link>
    </div>,
    document.body,
  );
}
