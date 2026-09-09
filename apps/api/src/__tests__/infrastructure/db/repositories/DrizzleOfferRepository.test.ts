import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleOfferRepository } from '#src/infrastructure/db/repositories/DrizzleOfferRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, offer } from '#src/infrastructure/db/schema.js';

describe('DrizzleOfferRepository', () => {
  let db: TestDb;
  let repo: DrizzleOfferRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleOfferRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(jobApplication).values({
      id: 'app-1',
      userId: 'u1',
      company: 'Acme',
      role: 'Eng',
      status: 'offered',
    });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(offer);
  });

  describe('findAllByUserId', () => {
    beforeEach(async () => {
      await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));
      await db.db.delete(user).where(eq(user.id, 'u2'));
    });

    it('returns offers across every application owned by the user, not other users', async () => {
      await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
      await db.db.insert(jobApplication).values({
        id: 'app-2',
        userId: 'u2',
        company: 'Globex',
        role: 'Eng',
        status: 'offered',
      });
      await repo.create({ id: 'o1', applicationId: 'app-1', baseSalary: 120_000 });
      await repo.create({ id: 'o2', applicationId: 'app-2', baseSalary: 90_000 });

      const offers = await repo.findAllByUserId('u1');

      expect(offers.map((o) => o.id)).toEqual(['o1']);
    });

    it('returns an empty array when the user has no offers', async () => {
      expect(await repo.findAllByUserId('u1')).toHaveLength(0);
    });

    it('excludes offers belonging to a trashed application', async () => {
      await db.db.insert(jobApplication).values({
        id: 'app-2',
        userId: 'u1',
        company: 'Globex',
        role: 'Eng',
        status: 'offered',
        deletedAt: new Date(),
      });
      await repo.create({ id: 'o1', applicationId: 'app-1', baseSalary: 120_000 });
      await repo.create({ id: 'o2', applicationId: 'app-2', baseSalary: 90_000 });

      const offers = await repo.findAllByUserId('u1');

      expect(offers.map((o) => o.id)).toEqual(['o1']);
    });
  });
});
