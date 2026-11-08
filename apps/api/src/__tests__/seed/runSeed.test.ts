import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { eq } from 'drizzle-orm';
import {
  user,
  jobApplication,
  note,
  contact,
  interviewRound,
  offer,
  applicationTag,
} from '#src/infrastructure/db/schema.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
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
    expect(await db.db.select().from(jobApplication)).toHaveLength(15);
  });

  it('replaces the previous demo user when run again', async () => {
    await runSeed(db.db);
    const [first] = await db.db.select().from(user);

    await runSeed(db.db);

    const users = await db.db.select().from(user);
    expect(users).toHaveLength(1);
    expect(users[0].id).not.toBe(first.id);
    expect(await db.db.select().from(jobApplication)).toHaveLength(15);
  });

  it('seeds one application at every per-application cap and one near it (JEF-494)', async () => {
    await runSeed(db.db);

    const apps = await db.db.select().from(jobApplication);
    const full = apps.find((a) => a.company === 'Quota Demo — At the limit');
    const nearly = apps.find((a) => a.company === 'Quota Demo — Nearly full');
    expect(full && nearly).toBeTruthy();

    const count = async (
      table:
        typeof note | typeof contact | typeof interviewRound | typeof offer | typeof applicationTag,
      id: string,
    ) => (await db.db.select().from(table).where(eq(table.applicationId, id))).length;
    expect(await count(note, full!.id)).toBe(CONTENT_LIMITS.NOTES_PER_APPLICATION);
    expect(await count(contact, full!.id)).toBe(CONTENT_LIMITS.CONTACTS_PER_APPLICATION);
    expect(await count(interviewRound, full!.id)).toBe(
      CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION,
    );
    expect(await count(offer, full!.id)).toBe(CONTENT_LIMITS.OFFERS_PER_APPLICATION);
    expect(await count(applicationTag, full!.id)).toBe(CONTENT_LIMITS.TAGS_PER_APPLICATION);
    expect(await count(note, nearly!.id)).toBe(
      Math.ceil(CONTENT_LIMITS.NOTES_PER_APPLICATION * 0.8),
    );
  });

  it('dates the demo account from the instant it is given (JEF-532)', async () => {
    const pinned = new Date('2026-11-08T12:00:00.000Z');

    await runSeed(db.db, pinned);

    const [demo] = await db.db.select().from(user);
    expect(demo.createdAt).toEqual(pinned);
  });

  it('gives the same applications the same ids on every run (JEF-532)', async () => {
    await runSeed(db.db);
    const first = (await db.db.select({ id: jobApplication.id }).from(jobApplication))
      .map((a) => a.id)
      .sort();

    await runSeed(db.db);
    const second = (await db.db.select({ id: jobApplication.id }).from(jobApplication))
      .map((a) => a.id)
      .sort();

    expect(second).toEqual(first);
  });
});
