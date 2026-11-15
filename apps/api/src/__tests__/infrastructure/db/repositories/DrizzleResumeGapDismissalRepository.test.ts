import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleResumeGapDismissalRepository } from '#src/infrastructure/db/repositories/DrizzleResumeGapDismissalRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { jobApplication, user } from '#src/infrastructure/db/schema.js';

describe('DrizzleResumeGapDismissalRepository', () => {
  let db: TestDb;
  let repo: DrizzleResumeGapDismissalRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleResumeGapDismissalRepository({ db: db.db });
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

  it('has nothing for an application with no answers', async () => {
    expect(await repo.findKeysByApplicationId('app-1')).toEqual([]);
    expect(await repo.countByApplicationId('app-1')).toBe(0);
  });

  it('keeps each application’s answers apart', async () => {
    await repo.add({ id: 'd1', applicationId: 'app-1', key: 'terraform' });
    await repo.add({ id: 'd2', applicationId: 'app-1', key: 'role:we-1' });
    await repo.add({ id: 'd3', applicationId: 'app-2', key: 'kafka' });

    expect((await repo.findKeysByApplicationId('app-1')).sort()).toEqual([
      'role:we-1',
      'terraform',
    ]);
    expect(await repo.findKeysByApplicationId('app-2')).toEqual(['kafka']);
    expect(await repo.countByApplicationId('app-1')).toBe(2);
  });

  it('treats a repeated answer as one', async () => {
    await repo.add({ id: 'd1', applicationId: 'app-1', key: 'terraform' });
    await repo.add({ id: 'd2', applicationId: 'app-1', key: 'terraform' });

    expect(await repo.findKeysByApplicationId('app-1')).toEqual(['terraform']);
  });

  it('goes with its application when that is deleted', async () => {
    await repo.add({ id: 'd1', applicationId: 'app-1', key: 'terraform' });

    await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-1'));

    expect(await repo.countByApplicationId('app-1')).toBe(0);
  });
});
