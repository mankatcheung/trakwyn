import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleProjectRepository } from '#src/infrastructure/db/repositories/DrizzleProjectRepository.js';
import { DrizzleAwardRepository } from '#src/infrastructure/db/repositories/DrizzleAwardRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { award, project, user } from '#src/infrastructure/db/schema.js';

describe('project and award repositories (JEF-592)', () => {
  let db: TestDb;
  let projects: DrizzleProjectRepository;
  let awards: DrizzleAwardRepository;

  beforeAll(async () => {
    db = await createTestDb();
    projects = new DrizzleProjectRepository({ db: db.db });
    awards = new DrizzleAwardRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u1@t.com', passwordHash: 'h' });
    await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(project);
    await db.db.delete(award);
  });

  const projectData = (id: string, over: Partial<Parameters<typeof projects.create>[0]> = {}) => ({
    id,
    userId: 'u1',
    name: id,
    role: null,
    url: null,
    startDate: null,
    endDate: null,
    description: null,
    ...over,
  });

  it('stores a project with its optional fields and lists the newest first', async () => {
    await projects.create(projectData('old', { startDate: new Date('2019-01-01T00:00:00Z') }));
    const created = await projects.create(
      projectData('new', {
        role: 'Maintainer',
        url: 'https://example.com',
        startDate: new Date('2023-01-01T00:00:00Z'),
        description: 'Built it.',
      }),
    );

    expect(created).toMatchObject({ role: 'Maintainer', url: 'https://example.com' });
    expect((await projects.findAllByUserId('u1')).map((p) => p.id)).toEqual(['new', 'old']);
    expect(await projects.findAllByUserId('u2')).toEqual([]);
  });

  it('updates and deletes a project', async () => {
    await projects.create(projectData('p1', { role: 'Lead' }));
    expect(await projects.update('p1', { role: null, name: 'Renamed' })).toMatchObject({
      name: 'Renamed',
      role: null,
    });
    await projects.delete('p1');
    expect(await projects.findById('p1')).toBeNull();
  });

  it('stores awards newest first and updates and deletes them', async () => {
    await awards.create({
      id: 'a-old',
      userId: 'u1',
      title: 'Old',
      issuer: null,
      date: new Date('2018-01-01T00:00:00Z'),
      description: null,
    });
    await awards.create({
      id: 'a-new',
      userId: 'u1',
      title: 'New',
      issuer: 'Acme',
      date: new Date('2022-06-01T00:00:00Z'),
      description: 'For shipping.',
    });
    expect((await awards.findAllByUserId('u1')).map((a) => a.id)).toEqual(['a-new', 'a-old']);

    expect((await awards.update('a-new', { issuer: null })).issuer).toBeNull();
    await awards.delete('a-old');
    expect(await awards.findById('a-old')).toBeNull();
  });

  it('removes both with the account', async () => {
    await projects.create(projectData('p1', { userId: 'u2' }));
    await awards.create({
      id: 'a1',
      userId: 'u2',
      title: 'A',
      issuer: null,
      date: null,
      description: null,
    });

    await db.db.delete(user).where(eq(user.id, 'u2'));

    expect(await projects.findById('p1')).toBeNull();
    expect(await awards.findById('a1')).toBeNull();
  });
});
