#!/usr/bin/env tsx
/**
 * CLI entry point for applying the Drizzle SQL migrations in `drizzle/` —
 * what CI's `migrate-db` job runs before every deploy.
 *
 * The migration logic lives in `applyMigrations.ts`, shared with the test DB
 * helpers. Point it at Neon's *direct* URL, not the `-pooler` one: the pooler
 * runs in transaction mode, and a migration is exactly the long, lock-taking
 * session work it is not meant for.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm db:migrate:apply
 *   DATABASE_URL=pglite:./.pglite pnpm db:migrate:apply   # local dev
 */

import 'dotenv/config';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from '#src/infrastructure/db/createDb.js';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';

const databaseUrl = process.env[ENV.DATABASE_URL];

if (!databaseUrl) {
  console.error(`${ENV.DATABASE_URL} is required`);
  process.exit(1);
}

const { db, close } = await createDb(databaseUrl);
try {
  await applyMigrations(db);
} finally {
  await close();
}
