import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from './createDb.js';

const DEFAULT_MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'drizzle');

/**
 * Arbitrary, fixed key for `pg_advisory_xact_lock`: two concurrent runs (a
 * re-run CI job overlapping the last one) serialize on it instead of both
 * applying the same migration. Released automatically at commit/rollback.
 */
const MIGRATION_LOCK_KEY = 342_001;

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

export interface ApplyMigrationsResult {
  applied: number;
  skipped: number;
}

function readJournal(migrationsDir: string): JournalEntry[] {
  const journalPath = join(migrationsDir, 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    throw new Error(`Migration journal not found at ${journalPath}`);
  }
  const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

function readStatements(
  migrationsDir: string,
  tag: string,
): { hash: string; statements: string[] } {
  const sqlPath = join(migrationsDir, `${tag}.sql`);
  if (!existsSync(sqlPath)) {
    throw new Error(`Migration file not found: ${sqlPath}`);
  }
  const source = readFileSync(sqlPath, 'utf-8');
  return {
    hash: createHash('sha256').update(source).digest('hex'),
    // drizzle-kit separates statements with this marker.
    statements: source
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Applies every Drizzle SQL migration in `drizzle/*.sql` that has not been
 * applied yet, recording each by content hash in `__drizzle_migrations`.
 *
 * Shared between the production migration CLI (`migrate.ts`) and the test DB
 * helpers (`createTestDb.ts`, `buildTestApp.ts`), so tests run against the
 * real migrations rather than a hand-maintained duplicate schema (JEF-201).
 *
 * The whole run is one transaction. Postgres DDL is transactional, so a
 * migration that fails part-way leaves no half-created tables behind and no
 * tracking row — the next run starts from the same clean state. (The libSQL
 * version of this runner needed drift-tolerant skips for exactly the
 * half-applied states that this rules out.)
 *
 * The cost: a migration may not contain a statement Postgres refuses inside a
 * transaction — `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE` used in
 * the same run, `VACUUM`. Nothing generated today does; one that needs to must
 * change this runner first, or it fails on every deploy.
 */
export async function applyMigrations(
  db: DrizzleDb,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<ApplyMigrationsResult> {
  const entries = readJournal(migrationsDir);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
    await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        created_at BIGINT NOT NULL
      )
    `);

    // `execute` is typed per driver; both node-postgres and PGlite return
    // their rows under `.rows`, which is all this needs.
    const appliedRows = (await tx.execute(
      sql`SELECT hash FROM "__drizzle_migrations"`,
    )) as unknown as {
      rows: { hash: string }[];
    };
    const appliedHashes = new Set(appliedRows.rows.map((row) => row.hash));

    let applied = 0;
    let skipped = 0;

    for (const entry of entries) {
      const { hash, statements } = readStatements(migrationsDir, entry.tag);
      if (appliedHashes.has(hash)) {
        skipped++;
        continue;
      }

      console.log(`  ▶  ${entry.tag}`);
      for (const statement of statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(
        sql`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`,
      );
      applied++;
    }

    console.log(`Migrations complete: ${applied} applied, ${skipped} skipped`);
    return { applied, skipped };
  });
}
