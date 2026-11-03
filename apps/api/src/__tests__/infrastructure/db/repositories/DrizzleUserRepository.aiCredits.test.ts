import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleUserRepository } from '#src/infrastructure/db/repositories/DrizzleUserRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user } from '#src/infrastructure/db/schema.js';

const MARCH = new Date('2026-03-01T00:00:00.000Z');
const APRIL = new Date('2026-04-01T00:00:00.000Z');

describe('DrizzleUserRepository hosted AI credits (JEF-447)', () => {
  let db: TestDb;
  let repo: DrizzleUserRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleUserRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(user);
    await repo.create({ id: 'u1', email: 'a@b.com' });
  });

  const used = async () => (await repo.findById('u1'))!.aiCreditsUsed;

  it('starts at zero with no period', async () => {
    const u = (await repo.findById('u1'))!;
    expect(u.aiCreditsUsed).toBe(0);
    expect(u.aiCreditsPeriodStart).toBeNull();
  });

  it('reserves up to the limit and refuses past it, leaving the counter alone', async () => {
    expect(await repo.reserveAiCredits('u1', 29, 30, MARCH)).toBe(true);
    expect(await repo.reserveAiCredits('u1', 2, 30, MARCH)).toBe(false);
    expect(await used()).toBe(29);
    expect(await repo.reserveAiCredits('u1', 1, 30, MARCH)).toBe(true);
    expect(await used()).toBe(30);
  });

  it('lets only one of two parallel reserves at 29/30 through', async () => {
    await repo.reserveAiCredits('u1', 29, 30, MARCH);

    const results = await Promise.all([
      repo.reserveAiCredits('u1', 1, 30, MARCH),
      repo.reserveAiCredits('u1', 1, 30, MARCH),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await used()).toBe(30);
  });

  it('never lets many parallel reserves overshoot the limit', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.reserveAiCredits('u1', 1, 5, MARCH)),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await used()).toBe(5);
  });

  it('restarts the counter on the first reserve of a new period, without a job', async () => {
    await repo.reserveAiCredits('u1', 30, 30, MARCH);
    expect(await repo.reserveAiCredits('u1', 1, 30, MARCH)).toBe(false);

    expect(await repo.reserveAiCredits('u1', 3, 30, APRIL)).toBe(true);

    const u = (await repo.findById('u1'))!;
    expect(u.aiCreditsUsed).toBe(3);
    expect(u.aiCreditsPeriodStart).toEqual(APRIL);
  });

  it('refuses a reserve larger than the whole limit even in a new period', async () => {
    expect(await repo.reserveAiCredits('u1', 31, 30, APRIL)).toBe(false);
    expect(await used()).toBe(0);
  });

  it('refunds within the period and never below zero', async () => {
    await repo.reserveAiCredits('u1', 3, 30, MARCH);

    await repo.releaseAiCredits('u1', 2, MARCH);
    expect(await used()).toBe(1);

    await repo.releaseAiCredits('u1', 5, MARCH);
    expect(await used()).toBe(0);
  });

  it('does not refund into a newer period', async () => {
    await repo.reserveAiCredits('u1', 3, 30, MARCH);
    await repo.reserveAiCredits('u1', 1, 30, APRIL);

    await repo.releaseAiCredits('u1', 3, MARCH);

    expect(await used()).toBe(1);
  });
});
