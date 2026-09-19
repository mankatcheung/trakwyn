import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

export const calendarConnection = sqliteTable(
  'CalendarConnection',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    accessToken: text('accessToken').notNull(),
    refreshToken: text('refreshToken').notNull(),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }).notNull(),
    externalCalendarId: text('externalCalendarId').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('CalendarConnection_userId_provider_key').on(table.userId, table.provider),
    index('CalendarConnection_userId_idx').on(table.userId),
  ],
);

export const calendarSyncedEvent = sqliteTable(
  'CalendarSyncedEvent',
  {
    id: text('id').primaryKey(),
    calendarConnectionId: text('calendarConnectionId')
      .notNull()
      .references(() => calendarConnection.id, { onDelete: 'cascade' }),
    sourceType: text('sourceType').notNull(),
    sourceId: text('sourceId').notNull(),
    externalEventId: text('externalEventId').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
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
