import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleUserActionTokenRepository } from '#src/infrastructure/db/repositories/DrizzleUserActionTokenRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, userActionToken } from '#src/infrastructure/db/schema.js';

const HOUR_MS = 60 * 60 * 1000;

describe('DrizzleUserActionTokenRepository', () => {
  let db: TestDb;
  let repo: DrizzleUserActionTokenRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleUserActionTokenRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(userActionToken);
    await db.db.delete(user);
    await db.db.insert(user).values([
      { id: 'user-1', email: 'a@b.com' },
      { id: 'user-2', email: 'c@d.com' },
    ]);
  });

  const issue = (overrides: Partial<Parameters<typeof repo.issue>[0]> = {}) =>
    repo.issue({
      id: 'token-1',
      userId: 'user-1',
      purpose: 'step_up_code',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + HOUR_MS),
      ...overrides,
    });

  describe('issue', () => {
    it('stores the token', async () => {
      const token = await issue();

      expect(token).toMatchObject({
        id: 'token-1',
        userId: 'user-1',
        purpose: 'step_up_code',
        tokenHash: 'hash-1',
        usedAt: null,
      });
    });

    it('replaces the earlier token of the same purpose, even a used one', async () => {
      await issue();
      await repo.consume('token-1', new Date());

      await issue({ id: 'token-2', tokenHash: 'hash-2' });

      const live = await repo.findLiveForUser('user-1', 'step_up_code', new Date());
      expect(live).toMatchObject({ id: 'token-2', tokenHash: 'hash-2', usedAt: null });
      expect(await repo.findByTokenHash('step_up_code', 'hash-1')).toBeNull();
    });

    it('keeps tokens of other purposes and other users', async () => {
      await issue();
      await issue({ id: 'token-2', purpose: 'account_deletion_confirm' });
      await issue({ id: 'token-3', userId: 'user-2' });

      const rows = await db.db.select().from(userActionToken);
      expect(rows.map((r) => r.id).sort()).toEqual(['token-1', 'token-2', 'token-3']);
    });

    it('lets two users hold the same code', async () => {
      await issue({ tokenHash: 'same' });
      await issue({ id: 'token-2', userId: 'user-2', tokenHash: 'same' });

      expect(await repo.findLiveForUser('user-2', 'step_up_code', new Date())).not.toBeNull();
    });
  });

  describe('findLiveForUser', () => {
    it('ignores an expired token', async () => {
      await issue({ expiresAt: new Date(Date.now() - 1000) });

      expect(await repo.findLiveForUser('user-1', 'step_up_code', new Date())).toBeNull();
    });

    it('ignores a used token', async () => {
      await issue();
      await repo.consume('token-1', new Date());

      expect(await repo.findLiveForUser('user-1', 'step_up_code', new Date())).toBeNull();
    });

    it('ignores a token of another purpose', async () => {
      await issue({ purpose: 'account_deletion_cancel' });

      expect(await repo.findLiveForUser('user-1', 'step_up_code', new Date())).toBeNull();
    });
  });

  describe('findByTokenHash', () => {
    it('matches on purpose as well as hash', async () => {
      await issue({ purpose: 'account_deletion_confirm' });

      expect(await repo.findByTokenHash('account_deletion_confirm', 'hash-1')).not.toBeNull();
      expect(await repo.findByTokenHash('account_deletion_cancel', 'hash-1')).toBeNull();
    });
  });

  describe('consume', () => {
    it('succeeds once and then refuses', async () => {
      await issue();

      expect(await repo.consume('token-1', new Date())).toBe(true);
      expect(await repo.consume('token-1', new Date())).toBe(false);
    });
  });

  describe('deleteForUser', () => {
    it('removes only that purpose for that user', async () => {
      await issue();
      await issue({ id: 'token-2', purpose: 'account_deletion_confirm' });
      await issue({ id: 'token-3', userId: 'user-2' });

      await repo.deleteForUser('user-1', 'step_up_code');

      const rows = await db.db.select().from(userActionToken);
      expect(rows.map((r) => r.id).sort()).toEqual(['token-2', 'token-3']);
    });
  });

  it('cascades with its user', async () => {
    await issue();

    await db.db.delete(user);

    expect(await db.db.select().from(userActionToken)).toEqual([]);
  });
});
