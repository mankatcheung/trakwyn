import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleCalendarConnectionRepository } from '#src/infrastructure/db/repositories/DrizzleCalendarConnectionRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, calendarConnection } from '#src/infrastructure/db/schema.js';

describe('DrizzleCalendarConnectionRepository', () => {
  let db: TestDb;
  let repo: DrizzleCalendarConnectionRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleCalendarConnectionRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(calendarConnection);
    await db.db.delete(user);
    await db.db.insert(user).values({ id: 'user-1', email: 'a@b.com', passwordHash: null });
  });

  const data = {
    id: 'conn-1',
    userId: 'user-1',
    provider: 'google' as const,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    externalCalendarId: 'primary',
  };

  describe('create', () => {
    it('persists a connection and returns the entity', async () => {
      const connection = await repo.create(data);

      expect(connection.id).toBe('conn-1');
      expect(connection.provider).toBe('google');
      expect(connection.accessTokenExpiresAt).toEqual(data.accessTokenExpiresAt);
      expect(connection.createdAt).toBeInstanceOf(Date);
    });

    it('upserts on (userId, provider) instead of erroring on reconnect', async () => {
      await repo.create(data);
      const reconnected = await repo.create({ ...data, id: 'conn-2', accessToken: 'access-2' });

      expect(reconnected.id).toBe('conn-1'); // same row, not a new one
      expect(reconnected.accessToken).toBe('access-2');
      expect(await repo.findAllByUserId('user-1')).toHaveLength(1);
    });
  });

  describe('findByUserIdAndProvider', () => {
    it('returns the connection when it exists', async () => {
      await repo.create(data);
      const found = await repo.findByUserIdAndProvider('user-1', 'google');
      expect(found?.id).toBe('conn-1');
    });

    it('returns null when there is none', async () => {
      expect(await repo.findByUserIdAndProvider('user-1', 'google')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates the stored tokens', async () => {
      await repo.create(data);
      const updated = await repo.update('conn-1', {
        accessToken: 'refreshed',
        accessTokenExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
      });

      expect(updated.accessToken).toBe('refreshed');
      expect(updated.accessTokenExpiresAt).toEqual(new Date('2100-01-01T00:00:00.000Z'));
    });
  });

  describe('delete', () => {
    it('removes the connection', async () => {
      await repo.create(data);
      await repo.delete('conn-1');
      expect(await repo.findById('conn-1')).toBeNull();
    });
  });
});
