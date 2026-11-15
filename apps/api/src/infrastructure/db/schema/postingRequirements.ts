import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { jobApplication } from './application.js';

/**
 * What an application's posting asks for (JEF-593): one row per application,
 * replaced when the posting is read again. The lists are stored as the JSON
 * the clients render; `postingHash` and `promptVersion` say which text and
 * which prompt produced them, so an unchanged posting is never read twice.
 */
export const postingRequirements = pgTable('PostingRequirements', {
  id: text('id').primaryKey(),
  applicationId: text('applicationId')
    .notNull()
    .unique()
    .references(() => jobApplication.id, { onDelete: 'cascade' }),
  mustHave: text('mustHave').notNull().default('[]'),
  niceToHave: text('niceToHave').notNull().default('[]'),
  keywords: text('keywords').notNull().default('[]'),
  seniority: text('seniority'),
  postingHash: text('postingHash').notNull(),
  promptVersion: integer('promptVersion').notNull(),
  generatedAt: timestamp('generatedAt', TIMESTAMP)
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A gap question the user answered "no" to for an application (JEF-594): a
 * posting keyword they have not used, or `role:<workExperienceId>` for a role
 * they will not add a number to. One row per question, so it is not asked again.
 */
export const resumeGapDismissal = pgTable(
  'ResumeGapDismissal',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ResumeGapDismissal_applicationId_key_idx').on(table.applicationId, table.key),
  ],
);
