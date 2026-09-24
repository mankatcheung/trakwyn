import type { DrizzleDb } from '#src/infrastructure/db/client.js';
import { createMigratedPglite } from './pgliteTemplate.js';

export interface TestDb {
  db: DrizzleDb;
  cleanup: () => Promise<void>;
}

/**
 * A fresh, isolated in-memory Postgres (PGlite) per caller, with the **real
 * migrations** applied — the same ones production runs, and the same thing
 * `integration/helpers/buildTestApp.ts` does.
 *
 * This used to execute a hand-written list of `CREATE TABLE` statements kept
 * alongside the schema, which meant two definitions to keep in step. Adding a
 * table left repository tests failing with `no such table` until the DDL was
 * copied into a second place (JEF-195), and a subtler divergence — a missing
 * `NOT NULL`, a different default — would have gone unnoticed while tests
 * passed against a laxer schema than production has. Running the migrations
 * makes the drift impossible (JEF-201).
 *
 * PGlite is real Postgres compiled to WASM, so constraint, cascade and type
 * behaviour matches Neon without a server or Docker (JEF-342). The database
 * is a clone of a template `globalSetup.ts` migrates once per run, rather
 * than migrated here — same schema, a fraction of the start-up cost.
 *
 * Call this once per test file (in `beforeAll`), not per `it()`.
 */
export async function createTestDb(): Promise<TestDb> {
  const { db, close } = await createMigratedPglite();
  return { db, cleanup: close };
}
