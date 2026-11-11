import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

/**
 * A user's rating of one AI output (JEF-547). It holds which feature, model and
 * prompt version wrote the output and no text from it, so it fits beside
 * telemetry that keeps prompts and completions out.
 */
export const aiFeedback = pgTable(
  'AiFeedback',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** `AI_FEEDBACK_TARGET`. */
    targetKind: text('targetKind').notNull(),
    /**
     * The message or draft rated. Deliberately not a foreign key: messages are
     * trimmed (`TrimmingMessageRepository`) and the row holds no content, so
     * the signal outlives the message. Erasure still removes it with the user.
     */
    targetId: text('targetId').notNull(),
    /** The `AI_FEATURE` behind the output. */
    feature: text('feature').notNull(),
    /** `AI_FEEDBACK_RATING`. */
    rating: text('rating').notNull(),
    /** `AI_FEEDBACK_REASON`, on a down-vote only. */
    reason: text('reason'),
    provider: text('provider'),
    model: text('model'),
    promptVersion: integer('promptVersion'),
    source: text('source'),
    tier: text('tier'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('AiFeedback_userId_targetKind_targetId_key').on(
      table.userId,
      table.targetKind,
      table.targetId,
    ),
    index('AiFeedback_feature_rating_idx').on(table.feature, table.rating),
  ],
);
