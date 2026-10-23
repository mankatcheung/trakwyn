import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, document } from '#src/infrastructure/db/schema.js';

const MIGRATION = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'drizzle',
  '0005_cloudy_angel.sql',
);

/** The statement of the JEF-425 migration that fills `User.documentBytes` for existing users. */
function backfillStatement(): string {
  const statement = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .find((part) => part.startsWith('UPDATE "User"'));
  if (!statement) throw new Error('0005 has no UPDATE "User" backfill');
  return statement;
}

const doc = (id: string, applicationId: string, sizeBytes: number) => ({
  id,
  applicationId,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes,
  storageKey: `k-${id}`,
});

describe('documentBytes backfill (JEF-425)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.db.insert(user).values([
      { id: 'u1', email: 'u1@t.com', passwordHash: 'h' },
      { id: 'u2', email: 'u2@t.com', passwordHash: 'h' },
      { id: 'u3', email: 'u3@t.com', passwordHash: 'h' },
    ]);
    const app = (id: string, userId: string, deletedAt: Date | null = null) => ({
      id,
      userId,
      company: 'Acme',
      role: 'Eng',
      status: 'draft' as const,
      deletedAt,
    });
    await db.db
      .insert(jobApplication)
      .values([app('a1', 'u1'), app('a2', 'u1'), app('a3', 'u1', new Date()), app('b1', 'u2')]);
    await db.db
      .insert(document)
      .values([
        doc('d1', 'a1', 1000),
        doc('d2', 'a2', 2000),
        doc('d3', 'a3', 4000),
        doc('d4', 'b1', 500),
      ]);
  });

  afterAll(() => db.cleanup());

  it('sets each user total to the sum of their documents, Trash included, and leaves the rest at 0', async () => {
    await db.db.execute(sql.raw(backfillStatement()));

    const rows = await db.db
      .select({ id: user.id, bytes: user.documentBytes })
      .from(user)
      .orderBy(user.id);

    expect(rows).toEqual([
      { id: 'u1', bytes: 7000 },
      { id: 'u2', bytes: 500 },
      { id: 'u3', bytes: 0 },
    ]);
    expect((await db.db.select().from(user).where(eq(user.id, 'u1')))[0].documentBytes).toBe(7000);
  });
});
