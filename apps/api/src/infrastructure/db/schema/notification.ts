import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const pushSubscription = pgTable(
  'PushSubscription',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /**
     * 'web' subscriptions carry a real endpoint URL plus VAPID key material
     * (p256dh/auth). 'expo' subscriptions (the mobile app) have neither —
     * `endpoint` holds the Expo push token itself, which is all
     * ExpoPushService needs to deliver to it.
     */
    provider: text('provider', { enum: ['web', 'expo'] })
      .notNull()
      .default('web'),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh'),
    auth: text('auth'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('PushSubscription_userId_idx').on(table.userId)],
);

export const notification = pgTable(
  'Notification',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** See NOTIFICATION_TYPE in constants.ts — drives which icon the inbox shows. */
    type: text('type', {
      enum: ['interview_reminder', 'follow_up_reminder', 'security_alert'],
    }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Where clicking the notification navigates to; null if not actionable. */
    url: text('url'),
    /** Null = unread. Set to the time the user marked it read. */
    readAt: timestamp('readAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('Notification_userId_idx').on(table.userId),
    index('Notification_userId_readAt_idx').on(table.userId, table.readAt),
  ],
);
