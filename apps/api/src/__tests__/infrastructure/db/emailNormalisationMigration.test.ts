import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sql } from 'drizzle-orm';
import { describe, it, expect, afterEach } from 'vitest';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';
import { createDb, type DbHandle } from '#src/infrastructure/db/createDb.js';

const REAL_MIGRATIONS = join(import.meta.dirname, '..', '..', '..', '..', 'drizzle');
const EMAIL_MIGRATION = '0031_dazzling_shaman';

/** A copy of the real migrations directory, stopped just before the email migration (JEF-692). */
function migrationsBeforeEmailNormalisation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trakwyn-email-migration-'));
  cpSync(REAL_MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
    entries: { tag: string }[];
  };
  const index = journal.entries.findIndex((entry) => entry.tag === EMAIL_MIGRATION);
  expect(index, `${EMAIL_MIGRATION} is in the journal`).toBeGreaterThan(-1);
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
  );
  return dir;
}

async function insertLegacyUser(
  handle: DbHandle,
  id: string,
  email: string,
  backupEmail: string | null = null,
): Promise<void> {
  await handle.db.execute(
    sql`INSERT INTO "User" ("id", "email", "backupEmail", "createdAt", "updatedAt")
        VALUES (${id}, ${email}, ${backupEmail}, now(), now())`,
  );
}

async function emails(
  handle: DbHandle,
): Promise<{ id: string; email: string; backup: string | null }[]> {
  const result = (await handle.db.execute(
    sql`SELECT "id", "email", "backupEmail" AS backup FROM "User" ORDER BY "id"`,
  )) as unknown as { rows: { id: string; email: string; backup: string | null }[] };
  return result.rows;
}

// Boots a fresh PGlite (initdb included), so it gets the same ceiling as applyMigrations.test.ts.
describe('email normalisation migration (JEF-692)', { timeout: 60_000 }, () => {
  let handle: DbHandle | undefined;
  let beforeDir: string | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    if (beforeDir) rmSync(beforeDir, { recursive: true, force: true });
    beforeDir = undefined;
  });

  const migrateToJustBefore = async (): Promise<DbHandle> => {
    handle = await createDb('pglite:memory');
    beforeDir = migrationsBeforeEmailNormalisation();
    await applyMigrations(handle.db, beforeDir);
    return handle;
  };

  it('lowercases and trims existing emails and backup emails', async () => {
    const legacy = await migrateToJustBefore();
    await insertLegacyUser(legacy, 'u1', ' Jeff@Example.COM ', 'Backup@Example.com');
    await insertLegacyUser(legacy, 'u2', 'already@lower.com');

    const result = await applyMigrations(legacy.db);

    expect(result.applied).toBe(1);
    expect(await emails(legacy)).toEqual([
      { id: 'u1', email: 'jeff@example.com', backup: 'backup@example.com' },
      { id: 'u2', email: 'already@lower.com', backup: null },
    ]);
  });

  it('makes email uniqueness case-insensitive', async () => {
    const legacy = await migrateToJustBefore();
    await applyMigrations(legacy.db);

    await insertLegacyUser(legacy, 'u1', 'a@b.com');
    await expect(insertLegacyUser(legacy, 'u2', 'A@B.com')).rejects.toThrow();
  });

  it('refuses to apply, naming the address, when two accounts differ only by case', async () => {
    const legacy = await migrateToJustBefore();
    await insertLegacyUser(legacy, 'u1', 'Dup@Example.com');
    await insertLegacyUser(legacy, 'u2', 'dup@example.com');

    // Drizzle wraps the driver error: the Postgres message is on `cause`.
    const failure = await applyMigrations(legacy.db).then(
      () => null,
      (error: Error & { cause?: Error }) => error,
    );
    expect(failure).not.toBeNull();
    expect(failure?.cause?.message).toMatch(/JEF-692: .*must be resolved first: dup@example\.com/);

    // The whole run rolled back: the rows are untouched and the old constraint still holds.
    expect((await emails(legacy)).map((row) => row.email)).toEqual([
      'Dup@Example.com',
      'dup@example.com',
    ]);
  });
});
