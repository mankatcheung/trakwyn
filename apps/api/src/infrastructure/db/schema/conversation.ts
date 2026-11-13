import { pgTable, text, integer, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const conversation = pgTable(
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
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Conversation_userId_idx').on(table.userId)],
);

export const message = pgTable(
  'Message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversationId')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    /**
     * What the assistant looked up to produce this reply, as one short line
     * per tool call (F10) — "list_applications → app-1 Acme/Engineer, …".
     * Rendered back into the prompt on later turns so the model does not
     * re-fetch what it already saw; never shown in the UI. Null on user
     * messages and on replies that needed no tools.
     */
    toolTrace: text('toolTrace'),
    /**
     * Which model and prompt wrote this (JEF-547), snapshotted when the output
     * is written so a rating can name them after a failover. All null on
     * output from before the snapshot, and on rows nobody rates.
     */
    aiProvider: text('aiProvider'),
    aiModel: text('aiModel'),
    aiPromptVersion: integer('aiPromptVersion'),
    aiSource: text('aiSource'),
    aiTier: text('aiTier'),
    /** The PostHog trace of the generation (JEF-569); null before it existed. */
    aiTraceId: text('aiTraceId'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('Message_conversationId_idx').on(table.conversationId)],
);

export const chatActionProposal = pgTable(
  'ChatActionProposal',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    conversationId: text('conversationId')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    /**
     * The assistant message the proposal was made in. Not a foreign key:
     * messages only go with their conversation, which already cascades here,
     * and the id is attached after the reply is stored.
     */
    messageId: text('messageId'),
    toolName: text('toolName').notNull(),
    args: jsonb('args').$type<Record<string, unknown>>().notNull(),
    summary: text('summary').notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'dismissed', 'expired', 'failed'],
    })
      .notNull()
      .default('pending'),
    error: text('error'),
    expiresAt: timestamp('expiresAt', TIMESTAMP).notNull(),
    resolvedAt: timestamp('resolvedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('ChatActionProposal_conversationId_idx').on(table.conversationId),
    index('ChatActionProposal_userId_idx').on(table.userId),
  ],
);
