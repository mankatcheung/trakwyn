import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication } from '#src/infrastructure/db/schema.js';
import { runSeed, DEMO_EMAIL } from '#src/seed/index.js';

describe('runSeed', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => db.cleanup());

  it('seeds the demo user into the database it is given', async () => {
    await runSeed(db.db);

    const users = await db.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(DEMO_EMAIL);
    expect(await db.db.select().from(jobApplication)).toHaveLength(13);
  });

  it('replaces the previous demo user when run again', async () => {
    await runSeed(db.db);
    const [first] = await db.db.select().from(user);

    await runSeed(db.db);

    const users = await db.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0].id).not.toBe(first.id);
    expect(await db.db.select().from(jobApplication)).toHaveLength(13);
  });
});
