#!/usr/bin/env tsx
/**
 * One-off JEF-342 cutover step: copies every row from the Turso (libSQL)
 * database into a freshly migrated, empty Postgres database. Delete this file
 * and `infrastructure/db/copyToPostgres.ts` once Turso has been retired.
 *
 * Order (the cutover runbook has the full window):
 *   1. DATABASE_URL=<neon direct url> pnpm db:migrate
 *   2. TURSO_URL=libsql://... TURSO_AUTH_TOKEN=... \
 *        DATABASE_URL=<neon direct url> pnpm db:copy-from-turso
 *
 * It refuses a target that already has rows, runs as one transaction, and
 * prints per-table row counts for both sides — any mismatch rolls the whole
 * copy back. Use Neon's *direct* URL, not the pooler.
 *
 * TURSO_URL may also be a local `file:` path, to rehearse against a copy.
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createDb } from '#src/infrastructure/db/createDb.js';
import { copyToPostgres, type SourceReader } from '#src/infrastructure/db/copyToPostgres.js';

const tursoUrl = process.env.TURSO_URL;
const databaseUrl = process.env[ENV.DATABASE_URL];

if (!tursoUrl || !databaseUrl) {
  console.error(
    'TURSO_URL and DATABASE_URL are both required (TURSO_AUTH_TOKEN for a remote Turso URL).',
  );
  process.exit(1);
}

const turso = createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
const source: SourceReader = {
  async readTable(table) {
    const result = await turso.execute(`SELECT * FROM "${table}"`);
    return result.rows.map((row) => Object.fromEntries(result.columns.map((c) => [c, row[c]])));
  },
};

const { db, close } = await createDb(databaseUrl);
try {
  const report = await copyToPostgres(source, db);
  console.table(report);
  console.log(
    `Copied ${report.reduce((n, r) => n + r.targetRows, 0)} rows across ${report.length} tables.`,
  );
} finally {
  turso.close();
  await close();
}
