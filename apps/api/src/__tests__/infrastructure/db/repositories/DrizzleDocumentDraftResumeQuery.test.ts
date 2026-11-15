import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleDocumentDraftRepository } from '#src/infrastructure/db/repositories/DrizzleDocumentDraftRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, documentDraft } from '#src/infrastructure/db/schema.js';

describe('DrizzleDocumentDraftRepository.findResumeDraftsByUserId (JEF-598)', () => {
  let db: TestDb;
  let repo: DrizzleDocumentDraftRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleDocumentDraftRepository({ db: db.db });
    await db.db.insert(user).values([
      { id: 'u1', email: 'u1@t.com', passwordHash: 'h' },
      { id: 'u2', email: 'u2@t.com', passwordHash: 'h' },
    ]);
    await db.db.insert(jobApplication).values([
      { id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' },
      { id: 'app-2', userId: 'u1', company: 'Globex', role: 'Eng', status: 'draft' },
      {
        id: 'app-trash',
        userId: 'u1',
        company: 'Old',
        role: 'Eng',
        status: 'draft',
        deletedAt: new Date(),
      },
      { id: 'app-other', userId: 'u2', company: 'Initech', role: 'Eng', status: 'draft' },
    ]);
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(documentDraft);
  });

  const draft = (id: string, applicationId: string, type: 'resume' | 'cover_letter') =>
    repo.create({
      id,
      applicationId,
      type,
      title: id,
      contentJson: '{"type":"doc"}',
      plainText: 'text',
    });

  it("returns the user's resume drafts across applications, and no cover letters", async () => {
    await draft('r1', 'app-1', 'resume');
    await draft('r2', 'app-2', 'resume');
    await draft('c1', 'app-1', 'cover_letter');

    const found = await repo.findResumeDraftsByUserId('u1');

    expect(found.map((d) => d.id).sort()).toEqual(['r1', 'r2']);
    expect(found.every((d) => d.type === 'resume')).toBe(true);
  });

  it("leaves out another user's drafts and drafts on trashed applications", async () => {
    await draft('r1', 'app-1', 'resume');
    await draft('other', 'app-other', 'resume');
    await draft('trashed', 'app-trash', 'resume');

    expect((await repo.findResumeDraftsByUserId('u1')).map((d) => d.id)).toEqual(['r1']);
    expect((await repo.findResumeDraftsByUserId('u2')).map((d) => d.id)).toEqual(['other']);
  });

  it('carries the generation snapshot, so the rule can tell an AI draft from a typed one', async () => {
    await draft('typed', 'app-1', 'resume');
    await draft('generated', 'app-2', 'resume');
    await repo.recordGeneration('generated', {
      provider: 'workersai',
      model: 'gpt-oss-120b',
      promptVersion: 6,
      source: 'platform',
      tier: null,
    });

    const byId = new Map((await repo.findResumeDraftsByUserId('u1')).map((d) => [d.id, d]));

    expect(byId.get('typed')?.generation).toBeNull();
    expect(byId.get('generated')?.generation).toMatchObject({
      model: 'gpt-oss-120b',
      promptVersion: 6,
    });
  });
});
