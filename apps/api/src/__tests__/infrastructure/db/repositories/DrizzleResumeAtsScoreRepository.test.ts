import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleResumeAtsScoreRepository } from '#src/infrastructure/db/repositories/DrizzleResumeAtsScoreRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import {
  user,
  jobApplication,
  document,
  documentDraft,
  resumeAtsScore,
} from '#src/infrastructure/db/schema.js';
import { makeSavedAtsScore } from '#src/__tests__/helpers/mocks/documents.js';

describe('DrizzleResumeAtsScoreRepository', () => {
  let db: TestDb;
  let repo: DrizzleResumeAtsScoreRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleResumeAtsScoreRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(jobApplication).values([
      { id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' },
      { id: 'app-2', userId: 'u1', company: 'Globex', role: 'Eng', status: 'draft' },
    ]);
    await db.db.insert(documentDraft).values([
      { id: 'draft-1', applicationId: 'app-1', type: 'resume', title: 'CV' },
      { id: 'draft-2', applicationId: 'app-2', type: 'resume', title: 'CV' },
    ]);
    await db.db.insert(document).values({
      id: 'doc-1',
      applicationId: 'app-1',
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      storageKey: 'k1',
      documentType: 'resume',
    });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(resumeAtsScore);
  });

  it('returns nothing when no resume was checked', async () => {
    expect(await repo.findByApplicationId('app-1')).toEqual([]);
  });

  it('stores and reads back a result, checks included', async () => {
    await repo.upsert(makeSavedAtsScore({ id: 'm1', applicationId: 'app-1' }));

    expect(await repo.findByApplicationId('app-1')).toEqual([
      makeSavedAtsScore({ id: 'm1', applicationId: 'app-1' }),
    ]);
  });

  it('checking a draft again replaces the row instead of adding a second one', async () => {
    await repo.upsert(makeSavedAtsScore({ id: 'm1', score: 40, resumeTextHash: 'old' }));
    // A re-check arrives with a fresh id: the conflict target is the draft.
    await repo.upsert(makeSavedAtsScore({ id: 'm2', score: 90, resumeTextHash: 'new' }));

    const rows = await repo.findByApplicationId('app-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'm2', score: 90, resumeTextHash: 'new' });
  });

  it('stores a result for an uploaded document and replaces it on a re-check', async () => {
    const forDoc = { documentDraftId: null, documentId: 'doc-1' };
    await repo.upsert(makeSavedAtsScore({ id: 'm1', ...forDoc, score: 30 }));
    await repo.upsert(makeSavedAtsScore({ id: 'm2', ...forDoc, score: 70 }));

    const rows = await repo.findByApplicationId('app-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'm2', documentId: 'doc-1', score: 70 });
  });

  it('keeps a draft and an upload on the same application apart', async () => {
    await repo.upsert(makeSavedAtsScore({ id: 'm1' }));
    await repo.upsert(makeSavedAtsScore({ id: 'm2', documentDraftId: null, documentId: 'doc-1' }));

    expect(await repo.findByApplicationId('app-1')).toHaveLength(2);
  });

  it('keeps results for different applications apart', async () => {
    await repo.upsert(makeSavedAtsScore({ id: 'm1' }));
    await repo.upsert(
      makeSavedAtsScore({ id: 'm2', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    expect(await repo.findByApplicationId('app-1')).toHaveLength(1);
    expect(await repo.findByApplicationId('app-2')).toHaveLength(1);
  });

  it('refuses a row that names no resume, or both', async () => {
    const bare = { documentDraftId: null, documentId: null };
    const both = { documentDraftId: 'draft-1', documentId: 'doc-1' };

    await expect(repo.upsert(makeSavedAtsScore({ id: 'm1', ...bare }))).rejects.toThrow();
    await expect(repo.upsert(makeSavedAtsScore({ id: 'm2', ...both }))).rejects.toThrow();
  });

  it('goes with its draft when the draft is deleted', async () => {
    await repo.upsert(
      makeSavedAtsScore({ id: 'm1', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    await db.db.delete(documentDraft).where(eq(documentDraft.id, 'draft-2'));

    expect(await repo.findByApplicationId('app-2')).toEqual([]);
    await db.db
      .insert(documentDraft)
      .values({ id: 'draft-2', applicationId: 'app-2', type: 'resume', title: 'CV' });
  });

  it('goes with its document when the document is deleted', async () => {
    await repo.upsert(makeSavedAtsScore({ id: 'm1', documentDraftId: null, documentId: 'doc-1' }));

    await db.db.delete(document).where(eq(document.id, 'doc-1'));

    expect(await repo.findByApplicationId('app-1')).toEqual([]);
    await db.db.insert(document).values({
      id: 'doc-1',
      applicationId: 'app-1',
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      storageKey: 'k1',
      documentType: 'resume',
    });
  });

  it('goes with the application when it is deleted', async () => {
    await repo.upsert(
      makeSavedAtsScore({ id: 'm1', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));

    expect(await db.db.select().from(resumeAtsScore)).toEqual([]);
  });
});
