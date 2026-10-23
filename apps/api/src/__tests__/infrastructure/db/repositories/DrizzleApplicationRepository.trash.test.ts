import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleApplicationRepository } from '#src/infrastructure/db/repositories/DrizzleApplicationRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { jobApplication, user } from '#src/infrastructure/db/schema.js';

/**
 * A trashed application must be invisible to every read except the ones that
 * exist to see it. The filter lives in this repository rather than in use
 * cases precisely so that holds for callers nobody thought about — the weekly
 * digest, the reminders job, the MCP tools, and whatever is added next.
 *
 * The failure this guards is quiet: not an error, just a deleted application
 * still counted in analytics or still generating a follow-up email.
 */
describe('DrizzleApplicationRepository — trashed applications', () => {
  const NOW = new Date('2026-08-20T12:00:00.000Z');
  let db: TestDb;
  let repo: DrizzleApplicationRepository;

  const base = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    userId: 'u1',
    company: 'Acme',
    role: 'Engineer',
    status: 'applied' as const,
    applicationLimit: null,
    ...over,
  });

  beforeEach(async () => {
    db = await createTestDb();
    repo = new DrizzleApplicationRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@test.com', passwordHash: 'h' });
    await repo.create(base('live'));
    await repo.create(base('trashed'));
    await repo.softDelete('trashed', NOW);
  });

  afterEach(() => db.cleanup());

  it('findAllByUserId excludes it', async () => {
    const found = await repo.findAllByUserId('u1');
    expect(found.map((a) => a.id)).toEqual(['live']);
  });

  it('findAllByUserId excludes it when filtering by status too', async () => {
    const found = await repo.findAllByUserId('u1', { status: 'applied' });
    expect(found.map((a) => a.id)).toEqual(['live']);
  });

  it('findPageByUserId excludes it', async () => {
    const page = await repo.findPageByUserId('u1', {}, { limit: 50 });
    expect(page.items.map((a) => a.id)).toEqual(['live']);
  });

  it('findPageByUserId excludes it from a search as well', async () => {
    const page = await repo.findPageByUserId('u1', { search: 'Acme' }, { limit: 50 });
    expect(page.items.map((a) => a.id)).toEqual(['live']);
  });

  it('findById refuses it — so the 38 use cases that gate on it refuse it too', async () => {
    expect(await repo.findById('trashed')).toBeNull();
    expect(await repo.findById('live')).not.toBeNull();
  });

  it('findDueForReminder skips it, so Trash stops generating follow-up email', async () => {
    const due = new Date(NOW.getTime() - 60_000);
    await repo.update('live', { followUpAt: due });
    await repo.update('trashed', { followUpAt: due });
    // update() clears reminderSentAt handling aside, both are now due
    const found = await repo.findDueForReminder();

    expect(found.map((a) => a.id)).not.toContain('trashed');
  });

  it('findTrashedByUserId shows only the trashed ones', async () => {
    const found = await repo.findTrashedByUserId('u1');
    expect(found.map((a) => a.id)).toEqual(['trashed']);
    expect(found[0].deletedAt).toEqual(NOW);
  });

  it('findByIdIncludingTrashed is the deliberate exception', async () => {
    // Used by the detail query so a link from an old email lands on a
    // read-only view with a Restore banner rather than a 404.
    const found = await repo.findByIdIncludingTrashed('trashed');
    expect(found?.id).toBe('trashed');
    expect(found?.deletedAt).toEqual(NOW);
  });

  it('restore brings it back everywhere at once', async () => {
    await repo.restore('trashed');

    expect(await repo.findById('trashed')).not.toBeNull();
    expect((await repo.findAllByUserId('u1')).map((a) => a.id).sort()).toEqual(['live', 'trashed']);
    expect(await repo.findTrashedByUserId('u1')).toEqual([]);
  });

  it('restore does not touch the children, because nothing ever deleted them', async () => {
    // The whole reason restore is one UPDATE rather than a reconstruction.
    const [row] = await db.db.select().from(jobApplication).where(eq(jobApplication.id, 'trashed'));
    expect(row.company).toBe('Acme');
  });

  it('findDueForPurge returns only what has sat past the window', async () => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    await repo.create(base('deleted-long-ago'));
    await repo.softDelete('deleted-long-ago', new Date(NOW.getTime() - THIRTY_DAYS - 1_000));

    // 'trashed' went into Trash at NOW, so it has served none of its window.
    const cutoff = new Date(NOW.getTime() - THIRTY_DAYS);
    const due = await repo.findDueForPurge(cutoff);

    expect(due.map((a) => a.id)).toEqual(['deleted-long-ago']);
  });

  it('delete still removes the row outright, for purge and account deletion', async () => {
    await repo.delete('trashed');

    expect(await repo.findByIdIncludingTrashed('trashed')).toBeNull();
  });
});
