import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleDocumentDraftVersionRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentDraftVersionRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import {
  user,
  jobApplication,
  documentDraft,
  documentDraftVersion,
} from '#src/infrastructure/db/schema.js';

describe('DrizzleDocumentDraftVersionRepository (JEF-584)', () => {
  let db: TestDb;
  let repo: DrizzleDocumentDraftVersionRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleDocumentDraftVersionRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db
      .insert(jobApplication)
      .values({ id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(documentDraft);
    for (const id of ['draft-1', 'draft-2']) {
      await db.db
        .insert(documentDraft)
        .values({ id, applicationId: 'app-1', type: 'resume', title: id });
    }
  });

  const add = (id: string, draftId = 'draft-1', source: 'autosave' | 'ai' = 'autosave') =>
    repo.create({ id, draftId, contentJson: `{"id":"${id}"}`, plainText: id, source });

  // The default timestamp is the insert time; space inserts out so "newest" is unambiguous.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('stores a version and reads it back by id', async () => {
    const created = await add('v1', 'draft-1', 'ai');
    expect(created).toMatchObject({ id: 'v1', draftId: 'draft-1', source: 'ai', plainText: 'v1' });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await repo.findById('v1')).toMatchObject({ contentJson: '{"id":"v1"}' });
    expect(await repo.findById('missing')).toBeNull();
  });

  it('lists a draft’s versions newest first and never another draft’s', async () => {
    await add('v1');
    await tick();
    await add('v2');
    await tick();
    await add('other', 'draft-2');
    await tick();
    await add('v3');
    expect((await repo.listByDraft('draft-1')).map((v) => v.id)).toEqual(['v3', 'v2', 'v1']);
    expect((await repo.listByDraft('draft-2')).map((v) => v.id)).toEqual(['other']);
  });

  it('finds the latest version of a draft, or null when there is none', async () => {
    expect(await repo.findLatestByDraft('draft-1')).toBeNull();
    await add('v1');
    await tick();
    await add('v2');
    expect((await repo.findLatestByDraft('draft-1'))?.id).toBe('v2');
  });

  describe('pruneToLimit', () => {
    it('keeps the newest snapshots up to the limit and removes the oldest first', async () => {
      for (const id of ['v1', 'v2', 'v3', 'v4', 'v5']) {
        await add(id);
        await tick();
      }
      const removed = await repo.pruneToLimit('draft-1', 3);
      expect(removed).toBe(2);
      expect((await repo.listByDraft('draft-1')).map((v) => v.id)).toEqual(['v5', 'v4', 'v3']);
    });

    it('removes nothing when the draft is at or under the limit', async () => {
      await add('v1');
      expect(await repo.pruneToLimit('draft-1', 3)).toBe(0);
      expect(await repo.listByDraft('draft-1')).toHaveLength(1);
    });

    it('only prunes the draft it is asked about', async () => {
      for (const id of ['a1', 'a2', 'a3']) {
        await add(id, 'draft-2');
        await tick();
      }
      await add('v1');
      await repo.pruneToLimit('draft-2', 1);
      expect(await repo.listByDraft('draft-2')).toHaveLength(1);
      expect(await repo.listByDraft('draft-1')).toHaveLength(1);
    });
  });

  it('is removed with its draft', async () => {
    await add('v1');
    await db.db.delete(documentDraft).where(eq(documentDraft.id, 'draft-1'));
    const rows = await db.db.select().from(documentDraftVersion);
    expect(rows).toHaveLength(0);
  });

  it('is removed with the account, through the application and the draft', async () => {
    await add('v1');
    await db.db.delete(user).where(eq(user.id, 'u1'));
    expect(await db.db.select().from(documentDraftVersion)).toHaveLength(0);
    // Put the user back for the next test's setup.
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db
      .insert(jobApplication)
      .values({ id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' });
  });
});
