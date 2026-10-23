import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleDocumentRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, document } from '#src/infrastructure/db/schema.js';
import { eq } from 'drizzle-orm';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';

const BASE_DOC = {
  id: 'doc-1',
  applicationId: 'app-1',
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 12345,
  storageKey: 'users/u1/applications/app-1/resume.pdf',
};

describe('DrizzleDocumentRepository', () => {
  let db: TestDb;
  let repo: DrizzleDocumentRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleDocumentRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(jobApplication).values({
      id: 'app-1',
      userId: 'u1',
      company: 'Acme',
      role: 'Eng',
      status: 'draft',
    });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(document);
    await db.db
      .update(jobApplication)
      .set({ documentCount: 0 })
      .where(eq(jobApplication.id, 'app-1'));
    await db.db.update(user).set({ documentBytes: 0 }).where(eq(user.id, 'u1'));
  });

  const usedBytes = async (): Promise<number> =>
    (await db.db.select({ bytes: user.documentBytes }).from(user).where(eq(user.id, 'u1')))[0]
      .bytes;

  describe('create', () => {
    it('persists a document and returns the entity', async () => {
      const doc = await repo.create(BASE_DOC);

      expect(doc.id).toBe('doc-1');
      expect(doc.applicationId).toBe('app-1');
      expect(doc.name).toBe('resume.pdf');
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.sizeBytes).toBe(12345);
      expect(doc.storageKey).toBe('users/u1/applications/app-1/resume.pdf');
      expect(doc.createdAt).toBeInstanceOf(Date);
    });

    it('rejects creation at the per-application document limit', async () => {
      await db.db
        .update(jobApplication)
        .set({ documentCount: CONTENT_LIMITS.DOCUMENTS_PER_APPLICATION })
        .where(eq(jobApplication.id, 'app-1'));

      await expect(repo.create(BASE_DOC)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
      expect(await db.db.select().from(document)).toHaveLength(0);
    });
  });

  describe('countByApplicationId', () => {
    it('returns the number of confirmed documents', async () => {
      await repo.create(BASE_DOC);
      await repo.create({ ...BASE_DOC, id: 'doc-2', storageKey: 'path/to/cover.pdf' });

      expect(await repo.countByApplicationId('app-1')).toBe(2);
    });
  });

  describe('findById', () => {
    it('returns the document when it exists', async () => {
      await repo.create(BASE_DOC);
      expect((await repo.findById('doc-1'))?.id).toBe('doc-1');
    });

    it('returns null when not found', async () => {
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findAllByApplicationId', () => {
    it('returns all documents for the application ordered newest first', async () => {
      await repo.create(BASE_DOC);
      await repo.create({ ...BASE_DOC, id: 'doc-2', storageKey: 'path/to/cover.pdf' });
      await db.db
        .update(document)
        .set({ createdAt: new Date('2024-01-01T00:00:00Z') })
        .where(eq(document.id, 'doc-1'));
      await db.db
        .update(document)
        .set({ createdAt: new Date('2024-01-02T00:00:00Z') })
        .where(eq(document.id, 'doc-2'));

      const docs = await repo.findAllByApplicationId('app-1');
      expect(docs).toHaveLength(2);
      expect(docs[0].id).toBe('doc-2');
    });

    it('returns an empty array when there are no documents', async () => {
      expect(await repo.findAllByApplicationId('app-1')).toHaveLength(0);
    });
  });

  describe('findAllByUserId', () => {
    beforeEach(async () => {
      await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));
      await db.db.delete(user).where(eq(user.id, 'u2'));
    });

    it('returns documents across every application owned by the user, not other users', async () => {
      await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
      await db.db.insert(jobApplication).values({
        id: 'app-2',
        userId: 'u2',
        company: 'Globex',
        role: 'Eng',
        status: 'draft',
      });
      await repo.create(BASE_DOC);
      await repo.create({ ...BASE_DOC, id: 'doc-2', applicationId: 'app-2', storageKey: 'other' });

      const docs = await repo.findAllByUserId('u1');

      expect(docs.map((d) => d.id)).toEqual(['doc-1']);
    });

    it('returns documents from multiple applications owned by the same user', async () => {
      await db.db.insert(jobApplication).values({
        id: 'app-2',
        userId: 'u1',
        company: 'Globex',
        role: 'Eng',
        status: 'draft',
      });
      await repo.create(BASE_DOC);
      await repo.create({ ...BASE_DOC, id: 'doc-2', applicationId: 'app-2', storageKey: 'other' });

      const docs = await repo.findAllByUserId('u1');

      expect(docs.map((d) => d.id).sort()).toEqual(['doc-1', 'doc-2']);
    });

    it('returns an empty array when the user has no documents', async () => {
      expect(await repo.findAllByUserId('u1')).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('removes the document', async () => {
      await repo.create(BASE_DOC);
      await repo.delete('doc-1');
      expect(await repo.findById('doc-1')).toBeNull();
    });

    it('frees a document quota slot after deletion', async () => {
      await repo.create(BASE_DOC);
      await repo.delete('doc-1');

      expect(
        (await db.db.select({ count: jobApplication.documentCount }).from(jobApplication))[0].count,
      ).toBe(0);
    });
  });
  describe('storage limit (JEF-425)', () => {
    const LIMIT = CONTENT_LIMITS.DOCUMENT_STORAGE_LIMIT_BYTES;

    it('adds the size of each document to the owner total', async () => {
      await repo.create(BASE_DOC);
      await repo.create({ ...BASE_DOC, id: 'doc-2', storageKey: 'b', sizeBytes: 500 });

      expect(await usedBytes()).toBe(12845);
    });

    it('accepts a document that exactly fills the limit', async () => {
      await db.db
        .update(user)
        .set({ documentBytes: LIMIT - 12345 })
        .where(eq(user.id, 'u1'));

      await repo.create(BASE_DOC);

      expect(await usedBytes()).toBe(LIMIT);
    });

    it('refuses a document that would pass the limit, naming used and limit, and stores nothing', async () => {
      await db.db
        .update(user)
        .set({ documentBytes: LIMIT - 100 })
        .where(eq(user.id, 'u1'));

      const err = await repo.create(BASE_DOC).catch((e) => e);

      expect(err).toMatchObject({ code: 'QUOTA_EXCEEDED' });
      expect((err as Error).message).toBe('Document storage is full: 100 MB of 100 MB used');
      expect(await db.db.select().from(document)).toHaveLength(0);
      expect(await usedBytes()).toBe(LIMIT - 100);
      expect(
        (await db.db.select({ count: jobApplication.documentCount }).from(jobApplication))[0].count,
      ).toBe(0);
    });

    it('lets only one of two simultaneous uploads take the last space', async () => {
      await db.db
        .update(user)
        .set({ documentBytes: LIMIT - 15000 })
        .where(eq(user.id, 'u1'));

      const results = await Promise.allSettled([
        repo.create(BASE_DOC),
        repo.create({ ...BASE_DOC, id: 'doc-2', storageKey: 'b' }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await usedBytes()).toBeLessThanOrEqual(LIMIT);
    });

    it('lowers the total when a document is deleted', async () => {
      await repo.create(BASE_DOC);
      await repo.delete('doc-1');

      expect(await usedBytes()).toBe(0);
    });

    it('never takes the total below zero', async () => {
      await repo.create(BASE_DOC);
      await db.db.update(user).set({ documentBytes: 10 }).where(eq(user.id, 'u1'));

      await repo.delete('doc-1');

      expect(await usedBytes()).toBe(0);
    });
  });
});
