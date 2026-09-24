import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const workExperience = pgTable(
  'WorkExperience',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    startDate: timestamp('startDate', TIMESTAMP).notNull(),
    endDate: timestamp('endDate', TIMESTAMP),
    description: text('description'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('WorkExperience_userId_idx').on(table.userId)],
);

export const education = pgTable(
  'Education',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    degree: text('degree'),
    field: text('field'),
    startDate: timestamp('startDate', TIMESTAMP).notNull(),
    endDate: timestamp('endDate', TIMESTAMP),
    description: text('description'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updatedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index('Education_userId_idx').on(table.userId)],
);

export const skill = pgTable(
  'Skill',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    proficiency: text('proficiency'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('Skill_userId_idx').on(table.userId)],
);
