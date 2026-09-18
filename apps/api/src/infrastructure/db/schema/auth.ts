import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { TIMESTAMP } from './columns.js';
import { user } from './user.js';

export const oauthAccount = pgTable(
  'OAuthAccount',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    email: text('email'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('OAuthAccount_provider_providerAccountId_key').on(
      table.provider,
      table.providerAccountId,
    ),
    index('OAuthAccount_userId_idx').on(table.userId),
  ],
);

export const totpBackupCode = pgTable(
  'TotpBackupCode',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    codeHash: text('codeHash').notNull().unique(),
    usedAt: timestamp('usedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('TotpBackupCode_userId_idx').on(table.userId)],
);

export const loginEvent = pgTable(
  'LoginEvent',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('LoginEvent_userId_idx').on(table.userId)],
);

export const securityEvent = pgTable(
  'SecurityEvent',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventType: text('eventType').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('SecurityEvent_userId_idx').on(table.userId)],
);

export const session = pgTable(
  'Session',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userAgent: text('userAgent'),
    ipAddress: text('ipAddress'),
    deviceLabel: text('deviceLabel'),
    location: text('location'),
    lastUsedAt: timestamp('lastUsedAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: timestamp('expiresAt', TIMESTAMP).notNull(),
    revokedAt: timestamp('revokedAt', TIMESTAMP),
    currentRefreshTokenId: text('currentRefreshTokenId'),
    previousRefreshTokenId: text('previousRefreshTokenId'),
    previousRotatedAt: timestamp('previousRotatedAt', TIMESTAMP),
  },
  (table) => [index('Session_userId_idx').on(table.userId)],
);

export const emailVerificationToken = pgTable(
  'EmailVerificationToken',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('tokenHash').notNull().unique(),
    newEmail: text('newEmail'),
    expiresAt: timestamp('expiresAt', TIMESTAMP).notNull(),
    usedAt: timestamp('usedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('EmailVerificationToken_userId_idx').on(table.userId)],
);

export const passwordResetToken = pgTable(
  'PasswordResetToken',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('tokenHash').notNull().unique(),
    expiresAt: timestamp('expiresAt', TIMESTAMP).notNull(),
    usedAt: timestamp('usedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('PasswordResetToken_userId_idx').on(table.userId)],
);

export const backupEmailVerificationToken = pgTable(
  'BackupEmailVerificationToken',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('tokenHash').notNull().unique(),
    newBackupEmail: text('newBackupEmail').notNull(),
    expiresAt: timestamp('expiresAt', TIMESTAMP).notNull(),
    usedAt: timestamp('usedAt', TIMESTAMP),
    createdAt: timestamp('createdAt', TIMESTAMP)
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('BackupEmailVerificationToken_userId_idx').on(table.userId)],
);
