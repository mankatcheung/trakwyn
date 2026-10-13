import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleResumeMatchRepository } from '#src/infrastructure/db/repositories/DrizzleResumeMatchRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import {
  user,
  jobApplication,
  document,
  documentDraft,
  resumeMatch,
} from '#src/infrastructure/db/schema.js';
import { makeResumeMatch } from '#src/__tests__/helpers/mocks/documents.js';

describe('DrizzleResumeMatchRepository', () => {
  let db: TestDb;
  let repo: DrizzleResumeMatchRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleResumeMatchRepository({ db: db.db });
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
    await db.db.delete(resumeMatch);
  });

  it('returns nothing when no match was generated', async () => {
    expect(await repo.findByApplicationId('app-1')).toEqual([]);
  });

  it('stores and reads back a match, keywords included', async () => {
    await repo.upsert(makeResumeMatch({ id: 'm1', applicationId: 'app-1' }));

    expect(await repo.findByApplicationId('app-1')).toEqual([
      makeResumeMatch({ id: 'm1', applicationId: 'app-1' }),
    ]);
  });

  it('regenerating a draft match replaces the row instead of adding a second one', async () => {
    await repo.upsert(makeResumeMatch({ id: 'm1', score: 40, resumeTextHash: 'old' }));
    // A regenerate arrives with a fresh id: the conflict target is the draft.
    await repo.upsert(makeResumeMatch({ id: 'm2', score: 90, resumeTextHash: 'new' }));

    const rows = await repo.findByApplicationId('app-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'm2', score: 90, resumeTextHash: 'new' });
  });

  it('stores a match for an uploaded document and replaces it on regenerate', async () => {
    const forDoc = { documentDraftId: null, documentId: 'doc-1' };
    await repo.upsert(makeResumeMatch({ id: 'm1', ...forDoc, score: 30 }));
    await repo.upsert(makeResumeMatch({ id: 'm2', ...forDoc, score: 70 }));

    const rows = await repo.findByApplicationId('app-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'm2', documentId: 'doc-1', score: 70 });
  });

  it('keeps a draft and an upload on the same application apart', async () => {
    await repo.upsert(makeResumeMatch({ id: 'm1' }));
    await repo.upsert(makeResumeMatch({ id: 'm2', documentDraftId: null, documentId: 'doc-1' }));

    expect(await repo.findByApplicationId('app-1')).toHaveLength(2);
  });

  it('keeps matches for different applications apart', async () => {
    await repo.upsert(makeResumeMatch({ id: 'm1' }));
    await repo.upsert(
      makeResumeMatch({ id: 'm2', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    expect(await repo.findByApplicationId('app-1')).toHaveLength(1);
    expect(await repo.findByApplicationId('app-2')).toHaveLength(1);
  });

  it('refuses a row that names no resume, or both', async () => {
    const bare = { documentDraftId: null, documentId: null };
    const both = { documentDraftId: 'draft-1', documentId: 'doc-1' };

    await expect(repo.upsert(makeResumeMatch({ id: 'm1', ...bare }))).rejects.toThrow();
    await expect(repo.upsert(makeResumeMatch({ id: 'm2', ...both }))).rejects.toThrow();
  });

  it('goes with its draft when the draft is deleted', async () => {
    await repo.upsert(
      makeResumeMatch({ id: 'm1', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    await db.db.delete(documentDraft).where(eq(documentDraft.id, 'draft-2'));

    expect(await repo.findByApplicationId('app-2')).toEqual([]);
    await db.db
      .insert(documentDraft)
      .values({ id: 'draft-2', applicationId: 'app-2', type: 'resume', title: 'CV' });
  });

  it('goes with its document when the document is deleted', async () => {
    await repo.upsert(makeResumeMatch({ id: 'm1', documentDraftId: null, documentId: 'doc-1' }));

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
      makeResumeMatch({ id: 'm1', applicationId: 'app-2', documentDraftId: 'draft-2' }),
    );

    await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));

    expect(await db.db.select().from(resumeMatch)).toEqual([]);
  });
});
