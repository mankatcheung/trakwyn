import {
  type AnyPgColumn,
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const jobApplication = pgTable(
  'JobApplication',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('draft'),
    jobUrl: text('jobUrl'),
    location: text('location'),
    salaryRange: text('salaryRange'),
    description: text('description'),
    appliedAt: timestamp('appliedAt', TIMESTAMP),
    starred: boolean('starred').notNull().default(false),
    source: text('source'),
    followUpAt: timestamp('followUpAt', TIMESTAMP),
    reminderSentAt: timestamp('reminderSentAt', TIMESTAMP),
    /**
     * Rank within its kanban column, ascending. Scoped to (userId, status) —
     * a card moving to another column is renumbered there, and the gap it
     * leaves behind is harmless because only relative order is read.
     *
     * The default of 0 is what makes this column free to add: the board sorts
     * on `boardPosition ASC, createdAt DESC, id DESC`, so before anything is
     * ever dragged every row ties at 0 and falls through to exactly the order
     * the board showed before this column existed. No backfill, and a newly
     * created application still sorts to the top of its column for the same
     * reason.
     */
    boardPosition: integer('boardPosition').notNull().default(0),
    documentCount: integer('documentCount').notNull().default(0),
    /**
     * In Trash since. Null for a live application.
     *
     * The only soft delete in this schema — everything else is a hard delete,
     * and the children below stay untouched while this is set: they are hidden
     * because their parent is, not because anything happened to them, which is
     * what makes restore a single UPDATE.
     */
    deletedAt: timestamp('deletedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('JobApplication_userId_idx').on(table.userId),
    index('JobApplication_userId_status_idx').on(table.userId, table.status),
    // Every list query filters on it, and the purge job scans by it.
    index('JobApplication_deletedAt_idx').on(table.deletedAt),
  ],
);

export const applicationTag = pgTable(
  'ApplicationTag',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [
    uniqueIndex('ApplicationTag_applicationId_name_key').on(table.applicationId, table.name),
    index('ApplicationTag_applicationId_idx').on(table.applicationId),
  ],
);

export const activityLog = pgTable(
  'ActivityLog',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    actorId: text('actorId').notNull(),
    eventType: text('eventType').notNull(),
    payload: text('payload').notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('ActivityLog_applicationId_idx').on(table.applicationId)],
);

export const interviewRound = pgTable(
  'InterviewRound',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('other'),
    scheduledAt: timestamp('scheduledAt', TIMESTAMP),
    completedAt: timestamp('completedAt', TIMESTAMP),
    interviewerName: text('interviewerName'),
    notes: text('notes'),
    outcome: text('outcome').notNull().default('pending'),
    pushNotificationSentAt: timestamp('pushNotificationSentAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('InterviewRound_applicationId_idx').on(table.applicationId)],
);

export const note = pgTable(
  'Note',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Note_applicationId_idx').on(table.applicationId)],
);

export const document = pgTable(
  'Document',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mimeType: text('mimeType').notNull(),
    sizeBytes: integer('sizeBytes').notNull(),
    storageKey: text('storageKey').notNull().unique(),
    documentType: text('documentType').notNull().default('other'),
    version: text('version'),
    sourceDraftId: text('sourceDraftId').references((): AnyPgColumn => documentDraft.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('Document_applicationId_idx').on(table.applicationId)],
);

export const offer = pgTable(
  'Offer',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    baseSalary: bigint('baseSalary', { mode: 'number' }).notNull(),
    bonus: bigint('bonus', { mode: 'number' }),
    equity: text('equity'),
    benefits: text('benefits'),
    costOfLivingAdjustment: bigint('costOfLivingAdjustment', { mode: 'number' }),
    currency: text('currency').notNull().default('USD'),
    period: text('period').notNull().default('yearly'),
    notes: text('notes'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Offer_applicationId_idx').on(table.applicationId)],
);

export const documentDraft = pgTable(
  'DocumentDraft',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['cover_letter', 'resume'] }).notNull(),
    title: text('title').notNull(),
    contentJson: text('contentJson').notNull().default('{}'),
    plainText: text('plainText').notNull().default(''),
    sourceDocumentId: text('sourceDocumentId').references(() => document.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('DocumentDraft_applicationId_idx').on(table.applicationId),
    index('DocumentDraft_sourceDocumentId_idx').on(table.sourceDocumentId),
  ],
);

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
    generatedAt: timestamp('generatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // No separate index: `.unique()` on applicationId already creates one, and
  // every read here is a lookup by that column.
  () => [],
);

export const contact = pgTable(
  'Contact',
  {
    id: text('id').primaryKey(),
    applicationId: text('applicationId')
      .notNull()
      .references(() => jobApplication.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    email: text('email'),
    phone: text('phone'),
    linkedinUrl: text('linkedinUrl'),
    notes: text('notes'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Contact_applicationId_idx').on(table.applicationId)],
);
