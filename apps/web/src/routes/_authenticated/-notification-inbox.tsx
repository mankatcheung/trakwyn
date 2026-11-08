import { lazy, Suspense, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { IconButton, Skeleton } from '@trakwyn/ui';
import { BellIcon, CalendarIcon, ClockIcon, ShieldIcon } from 'lucide-react';

// The popover only shows once the bell is clicked, so its code loads then; the
// badge above stays eager (JEF-537).
const NotificationPopover = lazy(() =>
  import('./-notification-popover').then((m) => ({ default: m.NotificationPopover })),
);

export const UNREAD_COUNT_QUERY = `query UnreadNotificationCount { unreadNotificationCount }`;

export const NOTIFICATIONS_PAGE_QUERY = `
  query NotificationsPage($cursor: String, $limit: Int) {
    notificationsPage(cursor: $cursor, limit: $limit) {
      hasNextPage
      nextCursor
      items {
        id
        type
        title
        body
        url
        read
        createdAt
      }
    }
  }
`;

export const MARK_NOTIFICATIONS_READ = `
  mutation MarkNotificationsRead($ids: [ID!]!, $isRead: Boolean!) {
    markNotificationsRead(ids: $ids, isRead: $isRead)
  }
`;

export type NotificationType = 'interview_reminder' | 'follow_up_reminder' | 'security_alert';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationsPageResult = {
  notificationsPage: {
    items: NotificationItem[];
    hasNextPage: boolean;
    nextCursor: string | null;
  };
};

export const NOTIFICATION_ICON: Record<NotificationType, React.ReactNode> = {
  interview_reminder: <CalendarIcon size={16} className="text-blue-500" />,
  follow_up_reminder: <ClockIcon size={16} className="text-amber-500" />,
  security_alert: <ShieldIcon size={16} className="text-red-500" />,
};

/**
 * Shaped like a real notification row (icon + title + body + timestamp), so
 * the initial load doesn't jump from empty space straight to a full list —
 * the same convention the rest of the app's list pages use (Trash,
 * Applications, Board) instead of a plain centered spinner.
 */
export function NotificationRowSkeleton() {
  return (
    <div className="flex items-start gap-2 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-700">
      <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4 rounded-sm" />
        <Skeleton className="h-3 w-full rounded-sm" />
        <Skeleton className="h-2.5 w-14 rounded-sm" />
      </div>
    </div>
  );
}

export function timeAgo(
  iso: string,
  t: (key: string, options?: Record<string, number>) => string,
): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('notificationInbox.justNow');
  if (minutes < 60) return t('notificationInbox.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notificationInbox.hoursAgo', { count: hours });
  return t('notificationInbox.daysAgo', { count: Math.floor(hours / 24) });
}

function useUnreadNotificationCount(): number {
  const { data } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => gqlClient.request<{ unreadNotificationCount: number }>(UNREAD_COUNT_QUERY),
    refetchInterval: 60_000,
  });
  return data?.unreadNotificationCount ?? 0;
}

function BellIconWithBadge({ unreadCount }: { unreadCount: number }) {
  return (
    <>
      <BellIcon size={18} />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-red-500" />
        </span>
      )}
    </>
  );
}

/**
 * Mobile bell — a plain link to the full notifications page. No popup: on a
 * small screen there's no good place to anchor a popover, and a full page is
 * the more usable target anyway (JEF-218).
 */
export function NotificationInboxLink({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  const unreadCount = useUnreadNotificationCount();

  return (
    <Link
      to="/notifications"
      aria-label={
        unreadCount > 0
          ? t('notificationInbox.notificationsUnreadAria', { count: unreadCount })
          : t('notificationInbox.title')
      }
      className={`relative inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200 ${className}`}
    >
      <BellIconWithBadge unreadCount={unreadCount} />
    </Link>
  );
}

/**
 * Desktop bell — opens a small popover anchored to the button (JEF-218),
 * showing the 5 most recent notifications with a link to the full page.
 * Replaces the old centered, backdrop-masked modal.
 */
export function NotificationInboxButton({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const unreadCount = useUnreadNotificationCount();

  return (
    <div className="inline-flex" ref={anchorRef}>
      <IconButton
        label={
          unreadCount > 0
            ? t('notificationInbox.notificationsUnreadAria', { count: unreadCount })
            : t('notificationInbox.title')
        }
        onClick={() => setIsOpen((open) => !open)}
        className={`relative ${className}`}
        icon={<BellIconWithBadge unreadCount={unreadCount} />}
      />
      {isOpen && (
        <Suspense fallback={null}>
          <NotificationPopover anchorRef={anchorRef} onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
