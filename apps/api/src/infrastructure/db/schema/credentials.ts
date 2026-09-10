import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

export const llmApiKey = sqliteTable(
  'LlmApiKey',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** See LLM_PROVIDER in constants.ts. One row per user per provider. */
    provider: text('provider').notNull(),
    /** Encrypted at rest (never returned to the client). */
    apiKey: text('apiKey').notNull(),
    /** Model override; required when provider is 'custom', optional elsewhere. */
    model: text('model'),
    /** Base URL; only used (and required) when provider is 'custom'. */
    baseUrl: text('baseUrl'),
    /**
     * Monthly ceiling on prompt+completion tokens for this key (JEF-258).
     * Null means no limit, which is the default and what every key had
     * before this column existed. Deliberately not touched by the key
     * upsert, so re-saving an API key keeps the limit already set on it.
     */
    monthlyTokenLimit: integer('monthlyTokenLimit'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('LlmApiKey_userId_idx').on(table.userId),
    uniqueIndex('LlmApiKey_userId_provider_key').on(table.userId, table.provider),
  ],
);

export const llmUsageEvent = sqliteTable(
  'LlmUsageEvent',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** See LLM_PROVIDER in constants.ts — same id space as LlmApiKey.provider. */
    provider: text('provider').notNull(),
    /** The actual model used for this call; null when the provider has none configured. */
    model: text('model'),
    promptTokens: integer('promptTokens').notNull(),
    completionTokens: integer('completionTokens').notNull(),
    /**
     * Of `promptTokens`, how many the provider served from its prompt cache
     * and how many it wrote to it (T3). `promptTokens` stays the total the
     * provider billed input for, so the monthly meter is unchanged; these
     * exist so the cache hit rate can be seen at all — before them a
     * `cache_control` marker that silently did nothing looked identical to
     * one that worked. Null for events recorded before the columns existed
     * and for providers that do not report the split.
     */
    cacheReadTokens: integer('cacheReadTokens'),
    cacheWriteTokens: integer('cacheWriteTokens'),
    /**
     * The counts above were not reported by the provider but estimated from
     * the request (F3) — a stream that was aborted before a provider that
     * only reports usage at the end ever got to. Counted toward the monthly
     * limit like any other event (the prompt was billed), but marked so the
     * meter can say how much of it is exact.
     */
    estimated: integer('estimated', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('LlmUsageEvent_userId_idx').on(table.userId),
    index('LlmUsageEvent_userId_provider_idx').on(table.userId, table.provider),
  ],
);

export const apiToken = sqliteTable(
  'ApiToken',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('tokenHash').notNull().unique(),
    scope: text('scope').notNull().default('full'),
    lastUsedAt: integer('lastUsedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('ApiToken_userId_idx').on(table.userId)],
);

export const mcpOAuthAccessToken = sqliteTable(
  'McpOAuthAccessToken',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    clientId: text('clientId').notNull(),
    /**
     * The grant this token was minted under — shared by the authorization code,
     * every access token, and every refresh token descended from one consent.
     * Revocation is grant-wide, so cutting off a client cannot leave a live
     * access token behind (RFC 7009 s2.1).
     */
    familyId: text('familyId').notNull(),
    tokenHash: text('tokenHash').notNull().unique(),
    scope: text('scope').notNull(),
    audience: text('audience').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revokedAt', { mode: 'timestamp_ms' }),
    lastUsedAt: integer('lastUsedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('McpOAuthAccessToken_userId_idx').on(table.userId),
    index('McpOAuthAccessToken_clientId_idx').on(table.clientId),
    index('McpOAuthAccessToken_familyId_idx').on(table.familyId),
    index('McpOAuthAccessToken_expiresAt_idx').on(table.expiresAt),
  ],
);

export const mcpOAuthClient = sqliteTable(
  'McpOAuthClient',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    redirectUris: text('redirectUris').notNull(),
    revokedAt: integer('revokedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('McpOAuthClient_createdAt_idx').on(table.createdAt)],
);

export const mcpOAuthAuthorizationCode = sqliteTable(
  'McpOAuthAuthorizationCode',
  {
    id: text('id').primaryKey(),
    codeHash: text('codeHash').notNull().unique(),
    /** Grant id, minted with the code and inherited by every token it yields. */
    familyId: text('familyId').notNull(),
    clientId: text('clientId')
      .notNull()
      .references(() => mcpOAuthClient.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    redirectUri: text('redirectUri').notNull(),
    scope: text('scope').notNull(),
    codeChallenge: text('codeChallenge').notNull(),
    codeChallengeMethod: text('codeChallengeMethod').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    consumedAt: integer('consumedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('McpOAuthAuthorizationCode_clientId_idx').on(table.clientId),
    index('McpOAuthAuthorizationCode_familyId_idx').on(table.familyId),
    index('McpOAuthAuthorizationCode_userId_idx').on(table.userId),
    index('McpOAuthAuthorizationCode_expiresAt_idx').on(table.expiresAt),
  ],
);

export const mcpOAuthRefreshToken = sqliteTable(
  'McpOAuthRefreshToken',
  {
    id: text('id').primaryKey(),
    tokenHash: text('tokenHash').notNull().unique(),
    familyId: text('familyId').notNull(),
    clientId: text('clientId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('usedAt', { mode: 'timestamp_ms' }),
    revokedAt: integer('revokedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('McpOAuthRefreshToken_familyId_idx').on(table.familyId),
    index('McpOAuthRefreshToken_userId_idx').on(table.userId),
    index('McpOAuthRefreshToken_expiresAt_idx').on(table.expiresAt),
  ],
);

export const shareLink = sqliteTable(
  'ShareLink',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('tokenHash').notNull().unique(),
    lastUsedAt: integer('lastUsedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('ShareLink_userId_idx').on(table.userId)],
);
