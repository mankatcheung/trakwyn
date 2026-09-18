import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyToPostgres, type SourceReader } from '#src/infrastructure/db/copyToPostgres.js';
import { document, documentDraft, jobApplication, user } from '#src/infrastructure/db/schema.js';
import { createTestDb, type TestDb } from '../../helpers/createTestDb.js';

const CREATED_MS = 1_787_837_151_077;
const UPDATED_MS = 1_788_257_733_907;

/** Rows as SQLite stored them: epoch-ms integers and 0/1 booleans. */
function sqliteRows(): Record<string, Record<string, unknown>[]> {
  return {
    User: [
      {
        id: 'u1',
        email: 'a@example.com',
        totpEnabled: 1,
        weeklyDigestEnabled: 0,
        emailVerifiedAt: null,
        createdAt: CREATED_MS,
        updatedAt: UPDATED_MS,
      },
    ],
    JobApplication: [
      {
        id: 'app1',
        userId: 'u1',
        company: 'Acme',
        role: 'Engineer',
        createdAt: CREATED_MS,
        updatedAt: UPDATED_MS,
      },
    ],
    // The mutual link: the document came from a draft, and the draft points
    // back at the document it was exported to.
    Document: [
      {
        id: 'doc1',
        applicationId: 'app1',
        name: 'cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageKey: 'k1',
        sourceDraftId: 'draft1',
        createdAt: CREATED_MS,
      },
    ],
    DocumentDraft: [
      {
        id: 'draft1',
        applicationId: 'app1',
        type: 'resume',
        title: 'CV',
        sourceDocumentId: 'doc1',
        createdAt: CREATED_MS,
        updatedAt: UPDATED_MS,
      },
    ],
  };
}

function readerFor(rows: Record<string, Record<string, unknown>[]>): SourceReader {
  return { readTable: async (table) => rows[table] ?? [] };
}

describe('copyToPostgres', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('converts SQLite timestamps and booleans to their Postgres types', async () => {
    await copyToPostgres(readerFor(sqliteRows()), testDb.db);

    const [copied] = await testDb.db.select().from(user).where(eq(user.id, 'u1'));
    expect(copied.createdAt).toEqual(new Date(CREATED_MS));
    expect(copied.updatedAt).toEqual(new Date(UPDATED_MS));
    expect(copied.totpEnabled).toBe(true);
    expect(copied.weeklyDigestEnabled).toBe(false);
    expect(copied.emailVerifiedAt).toBeNull();
  });

  it('copies the mutual Document ↔ DocumentDraft link, without touching updatedAt', async () => {
    await copyToPostgres(readerFor(sqliteRows()), testDb.db);

    const [doc] = await testDb.db.select().from(document);
    const [draft] = await testDb.db.select().from(documentDraft);
    expect(doc.sourceDraftId).toBe('draft1');
    expect(draft.sourceDocumentId).toBe('doc1');
    // Set by a raw UPDATE after both rows exist; `$onUpdate` must not fire.
    expect(draft.updatedAt).toEqual(new Date(UPDATED_MS));
  });

  it('reports matching row counts for every table', async () => {
    const report = await copyToPostgres(readerFor(sqliteRows()), testDb.db);

    expect(report.find((r) => r.table === 'JobApplication')).toEqual({
      table: 'JobApplication',
      sourceRows: 1,
      targetRows: 1,
    });
    expect(report.every((r) => r.sourceRows === r.targetRows)).toBe(true);
  });

  it('refuses a target that already has rows', async () => {
    await copyToPostgres(readerFor(sqliteRows()), testDb.db);

    await expect(copyToPostgres(readerFor(sqliteRows()), testDb.db)).rejects.toThrow(
      /already has rows/,
    );
  });

  it('rolls everything back when a table fails part-way', async () => {
    const rows = sqliteRows();
    rows.Document[0].notAColumn = 'x';

    await expect(copyToPostgres(readerFor(rows), testDb.db)).rejects.toThrow(/notAColumn/);

    // User and JobApplication were inserted before Document failed.
    expect(await testDb.db.select().from(user)).toEqual([]);
    expect(await testDb.db.select().from(jobApplication)).toEqual([]);
  });
});
