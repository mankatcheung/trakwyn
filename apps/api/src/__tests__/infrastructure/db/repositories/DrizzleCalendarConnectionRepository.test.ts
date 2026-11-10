import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleCalendarConnectionRepository } from '#src/infrastructure/db/repositories/DrizzleCalendarConnectionRepository.js';
import { LlmApiKeyCipher } from '#src/infrastructure/llm/LlmApiKeyCipher.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, calendarConnection } from '#src/infrastructure/db/schema.js';
import { eq } from 'drizzle-orm';

describe('DrizzleCalendarConnectionRepository', () => {
  let db: TestDb;
  let repo: DrizzleCalendarConnectionRepository;

  beforeAll(async () => {
    // The real cipher, so these tests prove what is actually stored.
    process.env[ENV.LLM_API_KEY_ENCRYPTION_KEY] ??= 'test-llm-api-key-encryption-key';
    db = await createTestDb();
    repo = new DrizzleCalendarConnectionRepository({
      db: db.db,
      llmApiKeyCipher: new LlmApiKeyCipher(),
    });
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

  describe('token encryption', () => {
    const storedRow = async (id: string) => {
      const [row] = await db.db
        .select()
        .from(calendarConnection)
        .where(eq(calendarConnection.id, id));
      return row;
    };

    it('stores both tokens encrypted and returns them decrypted', async () => {
      const connection = await repo.create(data);
      const row = await storedRow('conn-1');

      expect(row.accessToken).not.toContain('access-1');
      expect(row.refreshToken).not.toContain('refresh-1');
      expect(connection.accessToken).toBe('access-1');
      expect(connection.refreshToken).toBe('refresh-1');
      expect((await repo.findById('conn-1'))?.refreshToken).toBe('refresh-1');
    });

    it('encrypts a refreshed access token and leaves the refresh token alone', async () => {
      await repo.create(data);
      const before = await storedRow('conn-1');
      await repo.update('conn-1', { accessToken: 'refreshed' });
      const after = await storedRow('conn-1');

      expect(after.accessToken).not.toContain('refreshed');
      expect(after.refreshToken).toBe(before.refreshToken);
      expect((await repo.findById('conn-1'))?.accessToken).toBe('refreshed');
    });

    it('refuses a token copied onto another row', async () => {
      await db.db.insert(user).values({ id: 'user-2', email: 'c@d.com', passwordHash: null });
      await repo.create(data);
      await repo.create({ ...data, id: 'conn-2', userId: 'user-2' });
      const stolen = await storedRow('conn-1');
      await db.db
        .update(calendarConnection)
        .set({ accessToken: stolen.accessToken })
        .where(eq(calendarConnection.id, 'conn-2'));

      await expect(repo.findById('conn-2')).rejects.toThrow();
    });

    it('throws when updating a connection that does not exist', async () => {
      await expect(repo.update('missing', { accessToken: 'x' })).rejects.toThrow(/not found/);
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
