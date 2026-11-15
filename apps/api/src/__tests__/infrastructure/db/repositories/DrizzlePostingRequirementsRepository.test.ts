import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzlePostingRequirementsRepository } from '#src/infrastructure/db/repositories/DrizzlePostingRequirementsRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { jobApplication, postingRequirements, user } from '#src/infrastructure/db/schema.js';
import { makePostingRequirements } from '#src/__tests__/helpers/mocks/jobs.js';

describe('DrizzlePostingRequirementsRepository', () => {
  let db: TestDb;
  let repo: DrizzlePostingRequirementsRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzlePostingRequirementsRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(jobApplication);
    await db.db.insert(jobApplication).values([
      { id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' },
      { id: 'app-2', userId: 'u1', company: 'Globex', role: 'Eng', status: 'draft' },
    ]);
  });

  it('is null for an application whose posting was never read', async () => {
    expect(await repo.findByApplicationId('app-1')).toBeNull();
  });

  it('saves the lists and reads them back as they were', async () => {
    const requirements = makePostingRequirements({
      mustHave: ['5+ years of backend development', 'PostgreSQL "in production"'],
      niceToHave: [],
      keywords: ['PostgreSQL', 'C++'],
      seniority: null,
    });

    const saved = await repo.upsert(requirements);

    expect(saved).toEqual(requirements);
    expect(await repo.findByApplicationId('app-1')).toEqual(requirements);
  });

  it('replaces an application’s row instead of adding a second', async () => {
    await repo.upsert(makePostingRequirements({ id: 'req-1', keywords: ['Old'] }));

    await repo.upsert(
      makePostingRequirements({
        id: 'req-2',
        keywords: ['New'],
        seniority: 'Staff',
        postingHash: 'new-hash',
        promptVersion: 2,
        generatedAt: new Date('2026-12-01T00:00:00Z'),
      }),
    );

    const rows = await db.db
      .select()
      .from(postingRequirements)
      .where(eq(postingRequirements.applicationId, 'app-1'));
    expect(rows).toHaveLength(1);
    expect(await repo.findByApplicationId('app-1')).toMatchObject({
      id: 'req-2',
      keywords: ['New'],
      seniority: 'Staff',
      postingHash: 'new-hash',
      promptVersion: 2,
    });
  });

  it('keeps each application’s list apart', async () => {
    await repo.upsert(makePostingRequirements({ id: 'req-1', applicationId: 'app-1' }));
    await repo.upsert(
      makePostingRequirements({ id: 'req-2', applicationId: 'app-2', keywords: ['Go'] }),
    );

    expect((await repo.findByApplicationId('app-2'))?.keywords).toEqual(['Go']);
    expect((await repo.findByApplicationId('app-1'))?.keywords).toEqual([
      'PostgreSQL',
      'Kubernetes',
    ]);
  });

  it('goes with its application when that is deleted', async () => {
    await repo.upsert(makePostingRequirements());

    await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-1'));

    expect(await repo.findByApplicationId('app-1')).toBeNull();
  });
});
