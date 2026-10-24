import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { DrizzleBillingEventRepository } from '#src/infrastructure/db/repositories/DrizzleBillingEventRepository.js';
import { billingEvent, user } from '#src/infrastructure/db/schema.js';

describe('DrizzleBillingEventRepository', () => {
  let db: TestDb;
  let repo: DrizzleBillingEventRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = new DrizzleBillingEventRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'user-1', email: 'a@example.com', passwordHash: 'h' });
  });

  afterEach(() => db.cleanup());

  it('records an event once and reports a replay', async () => {
    expect(await repo.tryRecord('evt-1', 'user-1')).toBe(true);
    expect(await repo.tryRecord('evt-1', 'user-1')).toBe(false);
  });

  it('records an event that names no user', async () => {
    expect(await repo.tryRecord('evt-2', null)).toBe(true);
  });

  it('is erased with its user', async () => {
    await repo.tryRecord('evt-1', 'user-1');
    await db.db.delete(user).where(eq(user.id, 'user-1'));
    const rows = await db.db.select().from(billingEvent);
    expect(rows).toEqual([]);
  });
});
