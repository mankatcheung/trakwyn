import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleApplicationRepository } from '#src/infrastructure/db/repositories/DrizzleApplicationRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { jobApplication, user } from '#src/infrastructure/db/schema.js';

const BASE_APP = {
  id: 'app-1',
  userId: 'u1',
  company: 'Acme',
  role: 'Engineer',
  status: 'draft' as const,
  applicationLimit: null,
};

describe('DrizzleApplicationRepository posting text (JEF-591)', () => {
  let db: TestDb;
  let repo: DrizzleApplicationRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleApplicationRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'user@test.com', passwordHash: 'hash' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(jobApplication);
    await db.db.update(user).set({ applicationCount: 0 }).where(eq(user.id, 'u1'));
  });

  it('is null for an application created without one', async () => {
    const app = await repo.create(BASE_APP);

    expect(app.postingText).toBeNull();
    expect((await repo.findById('app-1'))?.postingText).toBeNull();
  });

  it('stores a long posting beside the description and reads it back', async () => {
    const posting = `Requirements: Kubernetes. ${'x'.repeat(12_000)}`;

    await repo.create({ ...BASE_APP, description: 'A summary.', postingText: posting });

    const found = await repo.findById('app-1');
    expect(found?.postingText).toBe(posting);
    expect(found?.description).toBe('A summary.');
  });

  it('updates and clears it without touching the description', async () => {
    await repo.create({ ...BASE_APP, description: 'A summary.', postingText: 'First capture.' });

    const updated = await repo.update('app-1', { postingText: 'Second capture.' });
    expect(updated.postingText).toBe('Second capture.');
    expect(updated.description).toBe('A summary.');

    const untouched = await repo.update('app-1', { company: 'Acme Ltd' });
    expect(untouched.postingText).toBe('Second capture.');

    const cleared = await repo.update('app-1', { postingText: null });
    expect(cleared.postingText).toBeNull();
  });
});
