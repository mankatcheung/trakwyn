import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const calendarConnection = pgTable(
  'CalendarConnection',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** Encrypted at rest (never returned to the client). */
    accessToken: text('accessToken').notNull(),
    /** Encrypted at rest (never returned to the client). */
    refreshToken: text('refreshToken').notNull(),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', TIMESTAMP).notNull(),
    externalCalendarId: text('externalCalendarId').notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('CalendarConnection_userId_provider_key').on(table.userId, table.provider),
    index('CalendarConnection_userId_idx').on(table.userId),
  ],
);

export const calendarSyncedEvent = pgTable(
  'CalendarSyncedEvent',
  {
    id: text('id').primaryKey(),
    calendarConnectionId: text('calendarConnectionId')
      .notNull()
      .references(() => calendarConnection.id, { onDelete: 'cascade' }),
    /** What the Google event mirrors. Only `interview` today (JEF-331). */
    sourceType: text('sourceType').notNull(),
    sourceId: text('sourceId').notNull(),
    externalEventId: text('externalEventId').notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('CalendarSyncedEvent_connection_source_key').on(
      table.calendarConnectionId,
      table.sourceType,
      table.sourceId,
    ),
    index('CalendarSyncedEvent_calendarConnectionId_idx').on(table.calendarConnectionId),
  ],
);
