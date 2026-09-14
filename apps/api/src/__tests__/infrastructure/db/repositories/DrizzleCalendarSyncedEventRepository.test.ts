import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleCalendarSyncedEventRepository } from '#src/infrastructure/db/repositories/DrizzleCalendarSyncedEventRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, calendarConnection, calendarSyncedEvent } from '#src/infrastructure/db/schema.js';

describe('DrizzleCalendarSyncedEventRepository', () => {
  let db: TestDb;
  let repo: DrizzleCalendarSyncedEventRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleCalendarSyncedEventRepository({ db: db.db });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(calendarSyncedEvent);
    await db.db.delete(calendarConnection);
    await db.db.delete(user);
    await db.db.insert(user).values({ id: 'user-1', email: 'a@b.com', passwordHash: null });
    await db.db.insert(calendarConnection).values({
      id: 'conn-1',
      userId: 'user-1',
      provider: 'google',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      accessTokenExpiresAt: new Date('2099-01-01'),
      externalCalendarId: 'primary',
    });
  });

  describe('upsert', () => {
    it('creates a row when none exists for the source', async () => {
      const row = await repo.upsert({
        id: 'se-1',
        calendarConnectionId: 'conn-1',
        sourceType: 'interview',
        sourceId: 'round-1',
        externalEventId: 'ext-1',
      });

      expect(row.id).toBe('se-1');
      expect(row.externalEventId).toBe('ext-1');
    });

    it('updates the externalEventId of the existing row instead of duplicating it', async () => {
      await repo.upsert({
        id: 'se-1',
        calendarConnectionId: 'conn-1',
        sourceType: 'interview',
        sourceId: 'round-1',
        externalEventId: 'ext-1',
      });
      const updated = await repo.upsert({
        id: 'se-2',
        calendarConnectionId: 'conn-1',
        sourceType: 'interview',
        sourceId: 'round-1',
        externalEventId: 'ext-2',
      });

      expect(updated.id).toBe('se-1');
      expect(updated.externalEventId).toBe('ext-2');
      expect(await repo.findAllByConnectionId('conn-1')).toHaveLength(1);
    });
  });

  describe('findBySource', () => {
    it('returns null when nothing is synced yet', async () => {
      expect(await repo.findBySource('conn-1', 'interview', 'round-1')).toBeNull();
    });
  });

  describe('deleteBySource', () => {
    it('removes only the matching row', async () => {
      await repo.upsert({
        id: 'se-1',
        calendarConnectionId: 'conn-1',
        sourceType: 'interview',
        sourceId: 'round-1',
        externalEventId: 'ext-1',
      });
      await repo.upsert({
        id: 'se-2',
        calendarConnectionId: 'conn-1',
        sourceType: 'applied',
        sourceId: 'app-1',
        externalEventId: 'ext-2',
      });

      await repo.deleteBySource('conn-1', 'interview', 'round-1');

      expect(await repo.findBySource('conn-1', 'interview', 'round-1')).toBeNull();
      expect(await repo.findBySource('conn-1', 'applied', 'app-1')).not.toBeNull();
    });
  });

  describe('deleteAllByConnectionId', () => {
    it('removes every row for the connection', async () => {
      await repo.upsert({
        id: 'se-1',
        calendarConnectionId: 'conn-1',
        sourceType: 'interview',
        sourceId: 'round-1',
        externalEventId: 'ext-1',
      });

      await repo.deleteAllByConnectionId('conn-1');

      expect(await repo.findAllByConnectionId('conn-1')).toEqual([]);
    });
  });
});
