import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleDocumentDraftRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentDraftRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, documentDraft } from '#src/infrastructure/db/schema.js';

describe('DrizzleDocumentDraftRepository', () => {
  let db: TestDb;
  let repo: DrizzleDocumentDraftRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleDocumentDraftRepository({ db: db.db });
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
    await db.db.delete(documentDraft);
  });

  const create = () =>
    repo.create({
      id: 'draft-1',
      applicationId: 'app-1',
      type: 'cover_letter',
      title: 'Untitled',
      contentJson: '{"type":"doc"}',
      plainText: 'Dear hiring manager',
    });

  describe('rename', () => {
    it('changes the title and returns the updated draft', async () => {
      await create();

      const renamed = await repo.rename('draft-1', 'Tailored for Acme');

      expect(renamed.title).toBe('Tailored for Acme');
      expect((await repo.findById('draft-1'))?.title).toBe('Tailored for Acme');
    });

    it('leaves the content untouched', async () => {
      await create();

      await repo.rename('draft-1', 'New name');

      const after = await repo.findById('draft-1');
      expect(after?.contentJson).toBe('{"type":"doc"}');
      expect(after?.plainText).toBe('Dear hiring manager');
    });

    it('advances updatedAt so the editor can tell it changed', async () => {
      const created = await create();

      const renamed = await repo.rename('draft-1', 'New name');

      expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });
  });

  describe('findRecentCoverLettersByUserExcludingApplication', () => {
    beforeAll(async () => {
      await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
      await db.db.insert(jobApplication).values([
        { id: 'app-2', userId: 'u1', company: 'Beta', role: 'Eng', status: 'draft' },
        { id: 'app-3', userId: 'u2', company: 'Gamma', role: 'Eng', status: 'draft' },
      ]);
    });

    afterAll(async () => {
      await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));
      await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-3'));
      await db.db.delete(user).where(eq(user.id, 'u2'));
    });

    it('excludes drafts on the application passed as excludeApplicationId', async () => {
      await repo.create({
        id: 'd-app1',
        applicationId: 'app-1',
        type: 'cover_letter',
        title: 'App 1',
        plainText: 'On app-1.',
      });
      await repo.create({
        id: 'd-app2',
        applicationId: 'app-2',
        type: 'cover_letter',
        title: 'App 2',
        plainText: 'On app-2.',
      });

      const drafts = await repo.findRecentCoverLettersByUserExcludingApplication('u1', 'app-1', 10);

      expect(drafts.map((d) => d.id)).toEqual(['d-app2']);
    });

    it('excludes resume drafts', async () => {
      await repo.create({
        id: 'd-app2-cl',
        applicationId: 'app-2',
        type: 'cover_letter',
        title: 'Cover letter',
        plainText: 'A cover letter.',
      });
      await repo.create({
        id: 'd-app2-resume',
        applicationId: 'app-2',
        type: 'resume',
        title: 'Resume',
        plainText: 'A resume.',
      });

      const drafts = await repo.findRecentCoverLettersByUserExcludingApplication('u1', 'app-1', 10);

      expect(drafts.map((d) => d.id)).toEqual(['d-app2-cl']);
    });

    it("excludes drafts belonging to a different user's applications", async () => {
      await repo.create({
        id: 'd-app2',
        applicationId: 'app-2',
        type: 'cover_letter',
        title: 'Mine',
        plainText: 'Mine.',
      });
      await repo.create({
        id: 'd-app3',
        applicationId: 'app-3',
        type: 'cover_letter',
        title: "Someone else's",
        plainText: "Someone else's.",
      });

      const drafts = await repo.findRecentCoverLettersByUserExcludingApplication('u1', 'app-1', 10);

      expect(drafts.map((d) => d.id)).toEqual(['d-app2']);
    });

    it('orders newest first and respects the limit', async () => {
      await repo.create({
        id: 'd-app2-a',
        applicationId: 'app-2',
        type: 'cover_letter',
        title: 'Older',
        plainText: 'Older.',
      });
      await db.db
        .update(documentDraft)
        .set({ updatedAt: new Date('2024-01-01T00:00:00Z') })
        .where(eq(documentDraft.id, 'd-app2-a'));
      await repo.create({
        id: 'd-app2-b',
        applicationId: 'app-2',
        type: 'cover_letter',
        title: 'Newer',
        plainText: 'Newer.',
      });
      await db.db
        .update(documentDraft)
        .set({ updatedAt: new Date('2024-06-01T00:00:00Z') })
        .where(eq(documentDraft.id, 'd-app2-b'));

      const drafts = await repo.findRecentCoverLettersByUserExcludingApplication('u1', 'app-1', 1);

      expect(drafts).toHaveLength(1);
      expect(drafts[0].id).toBe('d-app2-b');
    });
  });

  describe('draft counts and aiInstructions (JEF-506)', () => {
    const make = (id: string, plainText: string) =>
      repo.create({ id, applicationId: 'app-1', type: 'resume', title: id, plainText });

    it('countWithTextByApplicationId skips drafts whose text is empty or only whitespace', async () => {
      await make('d-empty', '');
      await make('d-blank', ' \n\t ');
      await make('d-text', 'Real content');

      expect(await repo.countWithTextByApplicationId('app-1')).toBe(1);
    });

    it('countByApplicationId counts every draft, blank or not, so it matches the list', async () => {
      await make('d-empty', '');
      await make('d-blank', ' \n\t ');
      await make('d-text', 'Real content');

      expect(await repo.countByApplicationId('app-1')).toBe(3);
      expect((await repo.findAllByApplicationId('app-1')).length).toBe(3);
    });

    it('defaults aiInstructions to null and saves them on create', async () => {
      expect((await make('d-1', 'x')).aiInstructions).toBeNull();
      const created = await repo.create({
        id: 'd-2',
        applicationId: 'app-1',
        type: 'resume',
        title: 'd-2',
        aiInstructions: 'Be brief',
      });
      expect(created.aiInstructions).toBe('Be brief');
    });

    it('updateContent leaves instructions alone when absent, sets and clears them otherwise', async () => {
      await make('d-1', 'x');
      const content = { contentJson: '{}', plainText: 'y' };

      expect((await repo.updateContent('d-1', content)).aiInstructions).toBeNull();
      expect(
        (await repo.updateContent('d-1', { ...content, aiInstructions: 'Shorter' })).aiInstructions,
      ).toBe('Shorter');
      expect((await repo.updateContent('d-1', content)).aiInstructions).toBe('Shorter');
      expect(
        (await repo.updateContent('d-1', { ...content, aiInstructions: null })).aiInstructions,
      ).toBeNull();
    });
  });

  describe('recordGeneration (JEF-547)', () => {
    const generation = {
      provider: 'google',
      model: 'gemini-test',
      promptVersion: 2,
      source: 'byok',
      tier: null,
      traceId: 'trace-1',
    };

    it('notes the model and prompt, and a later generation overwrites them', async () => {
      await create();
      expect((await repo.findById('draft-1'))?.generation).toBeNull();

      await repo.recordGeneration('draft-1', generation);
      expect((await repo.findById('draft-1'))?.generation).toEqual(generation);

      await repo.recordGeneration('draft-1', { ...generation, model: 'other', promptVersion: 3 });
      expect((await repo.findById('draft-1'))?.generation).toEqual({
        ...generation,
        model: 'other',
        promptVersion: 3,
      });
    });

    it('survives the user saving edits to the draft', async () => {
      await create();
      await repo.recordGeneration('draft-1', generation);

      await repo.updateContent('draft-1', { contentJson: '{"type":"doc"}', plainText: 'edited' });

      expect((await repo.findById('draft-1'))?.generation).toEqual(generation);
    });
  });
});
