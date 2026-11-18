import { graphql } from '#/graphql/generated';
/** Documents for the notification inbox, the notifications page and push registration. */

export const UNREAD_COUNT_QUERY = graphql(`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`);

export const NOTIFICATIONS_PAGE_QUERY = graphql(`
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
`);

export const MARK_NOTIFICATIONS_READ = graphql(`
  mutation MarkNotificationsRead($ids: [ID!]!, $isRead: Boolean!) {
    markNotificationsRead(ids: $ids, isRead: $isRead)
  }
`);

export const REGISTER_PUSH = graphql(`
  mutation RegisterPushSubscription($endpoint: String!, $p256dh: String!, $auth: String!) {
    registerPushSubscription(endpoint: $endpoint, p256dh: $p256dh, auth: $auth)
  }
`);

export const UNREGISTER_PUSH = graphql(`
  mutation UnregisterPushSubscription($endpoint: String!) {
    unregisterPushSubscription(endpoint: $endpoint)
  }
`);
