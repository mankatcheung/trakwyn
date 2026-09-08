import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

export const conversation = sqliteTable(
  'Conversation',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Auto-derived from the first message once sent; null for a brand-new empty conversation. */
    title: text('title'),
    /**
     * The provider/model this conversation uses — set once (at creation or
     * on the first message) and then locked for the life of the
     * conversation, so a single thread never mixes providers mid-way.
     */
    llmProvider: text('llmProvider'),
    llmModel: text('llmModel'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Conversation_userId_idx').on(table.userId)],
);

export const message = sqliteTable(
  'Message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversationId')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    /**
     * What the assistant looked up to produce this reply, as one short line
     * per tool call (F10) — "list_applications → app-1 Acme/Engineer, …".
     * Rendered back into the prompt on later turns so the model does not
     * re-fetch what it already saw; never shown in the UI. Null on user
     * messages and on replies that needed no tools.
     */
    toolTrace: text('toolTrace'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('Message_conversationId_idx').on(table.conversationId)],
);
