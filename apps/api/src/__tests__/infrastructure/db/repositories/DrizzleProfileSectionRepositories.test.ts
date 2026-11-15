import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { DrizzleCertificationRepository } from '#src/infrastructure/db/repositories/DrizzleCertificationRepository.js';
import { DrizzleLanguageRepository } from '#src/infrastructure/db/repositories/DrizzleLanguageRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { certification, language, user } from '#src/infrastructure/db/schema.js';

describe('certification and language repositories (JEF-592)', () => {
  let db: TestDb;
  let certifications: DrizzleCertificationRepository;
  let languages: DrizzleLanguageRepository;

  beforeAll(async () => {
    db = await createTestDb();
    certifications = new DrizzleCertificationRepository({ db: db.db });
    languages = new DrizzleLanguageRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u1@t.com', passwordHash: 'h' });
    await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(certification);
    await db.db.delete(language);
  });

  it('stores a certification with its optional fields and reads it back newest first', async () => {
    await certifications.create({
      id: 'c-old',
      userId: 'u1',
      name: 'Old',
      issuer: null,
      issuedAt: new Date('2019-01-01T00:00:00Z'),
      expiresAt: null,
      credentialUrl: null,
    });
    const created = await certifications.create({
      id: 'c-new',
      userId: 'u1',
      name: 'CKA',
      issuer: 'CNCF',
      issuedAt: new Date('2023-05-01T00:00:00Z'),
      expiresAt: new Date('2026-05-01T00:00:00Z'),
      credentialUrl: 'https://example.com/cka',
    });

    expect(created).toMatchObject({
      name: 'CKA',
      issuer: 'CNCF',
      credentialUrl: 'https://example.com/cka',
    });
    const all = await certifications.findAllByUserId('u1');
    expect(all.map((c) => c.id)).toEqual(['c-new', 'c-old']);
    expect(await certifications.findAllByUserId('u2')).toEqual([]);
  });

  it('updates and deletes a certification', async () => {
    await certifications.create({
      id: 'c1',
      userId: 'u1',
      name: 'CKA',
      issuer: 'CNCF',
      issuedAt: null,
      expiresAt: null,
      credentialUrl: null,
    });
    const updated = await certifications.update('c1', { issuer: null, name: 'CKAD' });
    expect(updated).toMatchObject({ name: 'CKAD', issuer: null });

    await certifications.delete('c1');
    expect(await certifications.findById('c1')).toBeNull();
  });

  it('stores languages in the order they were added', async () => {
    await languages.create({ id: 'l1', userId: 'u1', name: 'English', proficiency: 'Native' });
    await languages.create({ id: 'l2', userId: 'u1', name: 'French', proficiency: null });

    const all = await languages.findAllByUserId('u1');
    expect(all.map((l) => l.name)).toEqual(['English', 'French']);
    expect((await languages.update('l2', { proficiency: 'Fluent' })).proficiency).toBe('Fluent');
    await languages.delete('l1');
    expect(await languages.findById('l1')).toBeNull();
  });

  it('removes both with the account', async () => {
    await certifications.create({
      id: 'c1',
      userId: 'u2',
      name: 'CKA',
      issuer: null,
      issuedAt: null,
      expiresAt: null,
      credentialUrl: null,
    });
    await languages.create({ id: 'l1', userId: 'u2', name: 'English', proficiency: null });

    await db.db.delete(user).where(eq(user.id, 'u2'));

    expect(await certifications.findById('c1')).toBeNull();
    expect(await languages.findById('l1')).toBeNull();
  });
});
