import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { documentDraft } from './application.js';

/**
 * A saved copy of a draft's content (JEF-584). Cascades from the draft, so
 * deleting the draft, its application or the account removes its history.
 */
export const documentDraftVersion = pgTable(
  'DocumentDraftVersion',
  {
    id: text('id').primaryKey(),
    draftId: text('draftId')
      .notNull()
      .references(() => documentDraft.id, { onDelete: 'cascade' }),
    contentJson: text('contentJson').notNull(),
    plainText: text('plainText').notNull(),
    source: text('source', { enum: ['autosave', 'ai', 'manual', 'restore'] }).notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('DocumentDraftVersion_draftId_createdAt_idx').on(table.draftId, table.createdAt),
  ],
);
