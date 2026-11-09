import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { CompanySource } from '#src/domain/companyBriefing/CompanyBriefing.js';
import { TIMESTAMP } from './columns.js';
import { jobApplication } from './application.js';

export const companyBriefing = pgTable(
  'CompanyBriefing',
  {
    id: text('id').primaryKey(),
    // Unique, not just indexed: one briefing per application is the rule, and
    // regenerating replaces it. Enforced here so no code path can create a
    // second one by forgetting to delete the first.
    applicationId: text('applicationId')
      .notNull()
      .unique()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    // The pages the briefing was written from (JEF-475). A default of `[]`
    // so rows from before research existed, and briefings written when no
    // page could be read, need no special case.
    sources: jsonb('sources').$type<CompanySource[]>().notNull().default([]),
    generatedAt: timestamp('generatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // No separate index: `.unique()` on applicationId already creates one, and
  // every read here is a lookup by that column.
  () => [],
);
