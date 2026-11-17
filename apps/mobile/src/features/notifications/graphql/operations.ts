// Hand-written to match apps/web's apps/web/src/features/notifications/components/NotificationInbox.tsx
// field-for-field — see ../../applications/graphql/operations.ts for why these
// stay hand-typed rather than codegen'd.

export const UNREAD_NOTIFICATION_COUNT_QUERY = `
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`;

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

export const MARK_NOTIFICATIONS_READ_MUTATION = `
  mutation MarkNotificationsRead($ids: [ID!]!, $isRead: Boolean!) {
    markNotificationsRead(ids: $ids, isRead: $isRead)
  }
`;
