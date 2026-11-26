import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleTotpBackupCodeRepository } from '#src/infrastructure/db/repositories/DrizzleTotpBackupCodeRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, totpBackupCode } from '#src/infrastructure/db/schema.js';

describe('DrizzleTotpBackupCodeRepository', () => {
  let db: TestDb;
  let repo: DrizzleTotpBackupCodeRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleTotpBackupCodeRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(totpBackupCode);
    await db.db.delete(user);
    await db.db.insert(user).values({ id: 'user-1', email: 'a@b.com', passwordHash: 'hashed' });
  });

  describe('create', () => {
    it('persists a backup code and returns the entity', async () => {
      const code = await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });

      expect(code.id).toBe('code-1');
      expect(code.userId).toBe('user-1');
      expect(code.codeHash).toBe('hash-1');
      expect(code.usedAt).toBeNull();
      expect(code.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findByCodeHash', () => {
    it('returns the code when it exists', async () => {
      await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });

      const found = await repo.findByCodeHash('hash-1');
      expect(found?.id).toBe('code-1');
    });

    it('returns null when no code matches', async () => {
      const found = await repo.findByCodeHash('missing-hash');
      expect(found).toBeNull();
    });
  });

  describe('markUsed', () => {
    it('sets usedAt on the code', async () => {
      await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });

      expect(await repo.markUsed('code-1')).toBe(true);

      const found = await repo.findByCodeHash('hash-1');
      expect(found?.usedAt).toBeInstanceOf(Date);
    });

    it('refuses a code already used, keeping the first usedAt', async () => {
      await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });
      await repo.markUsed('code-1');
      const first = (await repo.findByCodeHash('hash-1'))?.usedAt;

      expect(await repo.markUsed('code-1')).toBe(false);
      expect((await repo.findByCodeHash('hash-1'))?.usedAt).toEqual(first);
    });
  });

  describe('deleteAllForUser', () => {
    it('removes all codes for the given user', async () => {
      await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });
      await repo.create({ id: 'code-2', userId: 'user-1', codeHash: 'hash-2' });

      await repo.deleteAllForUser('user-1');

      expect(await repo.findByCodeHash('hash-1')).toBeNull();
      expect(await repo.findByCodeHash('hash-2')).toBeNull();
    });

    it('does not affect codes belonging to other users', async () => {
      await db.db.insert(user).values({ id: 'user-2', email: 'c@d.com', passwordHash: 'hashed' });
      await repo.create({ id: 'code-1', userId: 'user-1', codeHash: 'hash-1' });
      await repo.create({ id: 'code-2', userId: 'user-2', codeHash: 'hash-2' });

      await repo.deleteAllForUser('user-1');

      expect(await repo.findByCodeHash('hash-1')).toBeNull();
      expect(await repo.findByCodeHash('hash-2')).not.toBeNull();
    });
  });
});
