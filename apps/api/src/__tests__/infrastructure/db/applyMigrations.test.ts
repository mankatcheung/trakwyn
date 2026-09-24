import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sql } from 'drizzle-orm';
import { describe, it, expect, afterEach } from 'vitest';
import { applyMigrations } from '#src/infrastructure/db/applyMigrations.js';
import { createDb, type DbHandle } from '#src/infrastructure/db/createDb.js';

async function tableNames(handle: DbHandle): Promise<string[]> {
  const result = (await handle.db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )) as unknown as { rows: { tablename: string }[] };
  return result.rows.map((row) => row.tablename);
}

/** Writes a throwaway migrations directory in drizzle-kit's layout. */
function writeMigrations(migrations: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'trakwyn-migrations-'));
  mkdirSync(join(dir, 'meta'));
  const entries = Object.keys(migrations).map((tag, idx) => ({ idx, tag }));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ entries }));
  for (const [tag, source] of Object.entries(migrations)) {
    writeFileSync(join(dir, `${tag}.sql`), source);
  }
  return dir;
}

// These boot fresh, empty PGlite databases — `initdb` included, which the
// template clone the other suites use skips — and that is slow under a
// fully loaded runner, so they get the hook-sized ceiling rather than 20s.
describe('applyMigrations', { timeout: 60_000 }, () => {
  let handle: DbHandle | undefined;
  let fixtureDir: string | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = undefined;
  });

  it('applies the real migrations to an empty database, then skips them on a re-run', async () => {
    handle = await createDb('pglite:memory');

    const first = await applyMigrations(handle.db);
    expect(first.applied).toBeGreaterThan(0);
    expect(first.skipped).toBe(0);
    expect(await tableNames(handle)).toEqual(expect.arrayContaining(['User', 'JobApplication']));

    const second = await applyMigrations(handle.db);
    expect(second).toEqual({ applied: 0, skipped: first.applied });
  });

  it('applies only the migrations added since the last run', async () => {
    handle = await createDb('pglite:memory');
    fixtureDir = writeMigrations({ '0000_a': 'CREATE TABLE "A" (id text PRIMARY KEY);' });
    await applyMigrations(handle.db, fixtureDir);

    writeFileSync(
      join(fixtureDir, 'meta', '_journal.json'),
      JSON.stringify({
        entries: [
          { idx: 0, tag: '0000_a' },
          { idx: 1, tag: '0001_b' },
        ],
      }),
    );
    writeFileSync(join(fixtureDir, '0001_b.sql'), 'CREATE TABLE "B" (id text PRIMARY KEY);');

    expect(await applyMigrations(handle.db, fixtureDir)).toEqual({ applied: 1, skipped: 1 });
    expect(await tableNames(handle)).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('rolls the whole run back when a migration fails part-way', async () => {
    handle = await createDb('pglite:memory');
    fixtureDir = writeMigrations({
      '0000_ok': 'CREATE TABLE "Kept" (id text PRIMARY KEY);',
      '0001_broken': [
        'CREATE TABLE "HalfDone" (id text PRIMARY KEY);',
        '--> statement-breakpoint',
        'ALTER TABLE "DoesNotExist" ADD COLUMN x text;',
      ].join('\n'),
    });

    await expect(applyMigrations(handle.db, fixtureDir)).rejects.toThrow();

    // Nothing from the failed run survives — not the migration that
    // succeeded before it, not the first statement of the broken one, and no
    // tracking rows claiming either was applied.
    const tables = await tableNames(handle);
    expect(tables).not.toContain('Kept');
    expect(tables).not.toContain('HalfDone');
    expect(tables).not.toContain('__drizzle_migrations');
  });
});
