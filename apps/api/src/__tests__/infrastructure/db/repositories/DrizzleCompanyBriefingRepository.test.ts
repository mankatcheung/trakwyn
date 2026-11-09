import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleCompanyBriefingRepository } from '#src/infrastructure/db/repositories/DrizzleCompanyBriefingRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, jobApplication, companyBriefing } from '#src/infrastructure/db/schema.js';
import { eq } from 'drizzle-orm';

describe('DrizzleCompanyBriefingRepository', () => {
  let db: TestDb;
  let repo: DrizzleCompanyBriefingRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleCompanyBriefingRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
    await db.db.insert(jobApplication).values([
      { id: 'app-1', userId: 'u1', company: 'Acme', role: 'Eng', status: 'draft' },
      { id: 'app-2', userId: 'u1', company: 'Globex', role: 'Eng', status: 'draft' },
    ]);
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(companyBriefing);
  });

  it('returns null when nothing has been generated', async () => {
    expect(await repo.findByApplicationId('app-1')).toBeNull();
  });

  it('stores and reads back a briefing', async () => {
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'Overview…',
      sources: [],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const found = await repo.findByApplicationId('app-1');
    expect(found).toMatchObject({ applicationId: 'app-1', content: 'Overview…' });
    expect(found?.generatedAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('stores the sources with the briefing and reads them back in order', async () => {
    const sources = [
      { url: 'https://acme.com', title: 'Acme | Payroll' },
      { url: 'https://acme.com/about', title: 'About Acme' },
    ];
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'Overview [1] [2]',
      sources,
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect((await repo.findByApplicationId('app-1'))?.sources).toEqual(sources);
  });

  it('keeps when a search source was published, and leaves a page without a date as it was', async () => {
    const sources = [
      { url: 'https://acme.com', title: 'Acme | Payroll' },
      {
        url: 'https://news.example/acme',
        title: 'Acme raises Series B',
        publishedAt: '2026-03-12T00:00:00.000Z',
      },
      { url: 'https://reviews.example/acme', title: 'Acme reviews', publishedAt: null },
    ];
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'Overview [1] [2] [3]',
      sources,
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect((await repo.findByApplicationId('app-1'))?.sources).toEqual(sources);
  });

  it('regenerating replaces the sources too, so a briefing never keeps the last one’s pages', async () => {
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'First',
      sources: [{ url: 'https://acme.com', title: 'Acme' }],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await repo.upsert({
      id: 'b2',
      applicationId: 'app-1',
      content: 'Second',
      sources: [],
      generatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });

    expect((await repo.findByApplicationId('app-1'))?.sources).toEqual([]);
  });

  it('reads a briefing saved before sources existed as having none', async () => {
    // The column default is what a row written before the migration gets.
    await db.db.insert(companyBriefing).values({
      id: 'old',
      applicationId: 'app-1',
      content: 'Written before research',
      generatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect((await repo.findByApplicationId('app-1'))?.sources).toEqual([]);
  });

  it('regenerating replaces the row instead of adding a second one', async () => {
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'First',
      sources: [],
      generatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    // A regenerate arrives with a fresh id — the conflict target is
    // applicationId, so it must replace rather than collide or duplicate.
    await repo.upsert({
      id: 'b2',
      applicationId: 'app-1',
      content: 'Second',
      sources: [],
      generatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });

    const rows = await db.db.select().from(companyBriefing);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('Second');
  });

  it('keeps briefings for different applications apart', async () => {
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-1',
      content: 'Acme',
      sources: [],
      generatedAt: new Date(),
    });
    await repo.upsert({
      id: 'b2',
      applicationId: 'app-2',
      content: 'Globex',
      sources: [],
      generatedAt: new Date(),
    });

    expect((await repo.findByApplicationId('app-1'))?.content).toBe('Acme');
    expect((await repo.findByApplicationId('app-2'))?.content).toBe('Globex');
  });

  it('goes with the application when it is deleted', async () => {
    await repo.upsert({
      id: 'b1',
      applicationId: 'app-2',
      content: 'Globex',
      sources: [],
      generatedAt: new Date(),
    });

    await db.db.delete(jobApplication).where(eq(jobApplication.id, 'app-2'));

    expect(await repo.findByApplicationId('app-2')).toBeNull();
    // Restore for any later test in this file.
    await db.db
      .insert(jobApplication)
      .values({ id: 'app-2', userId: 'u1', company: 'Globex', role: 'Eng', status: 'draft' });
  });
});
