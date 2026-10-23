import { describe, it, expect, vi } from 'vitest';
import { CachedUserRepository } from '#src/infrastructure/db/repositories/CachedUserRepository.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

function makeRepo() {
  const inner = makeUserRepository();
  const cache = new MemoryCache(60_000);
  const repo = new CachedUserRepository({ drizzleUserRepository: inner, cache });
  return { repo, inner, cache };
}

const user = makeUser();

describe('CachedUserRepository', () => {
  describe('findById', () => {
    it('fetches from inner on first call and populates cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);

      const result = await repo.findById('user-1');
      expect(result).toEqual(user);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call without hitting inner', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);

      await repo.findById('user-1');
      const result = await repo.findById('user-1');
      expect(result).toEqual(user);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('caches null when user is not found', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(null);

      await repo.findById('missing');
      await repo.findById('missing');
      expect(inner.findById).toHaveBeenCalledOnce();
    });
  });

  describe('findByEmail', () => {
    it('fetches from inner on first call and populates cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByEmail).mockResolvedValue(user);

      const result = await repo.findByEmail('test@example.com');
      expect(result).toEqual(user);
      expect(inner.findByEmail).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call without hitting inner', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByEmail).mockResolvedValue(user);

      await repo.findByEmail('test@example.com');
      const result = await repo.findByEmail('test@example.com');
      expect(result).toEqual(user);
      expect(inner.findByEmail).toHaveBeenCalledOnce();
    });

    it('caches null when no user matches the email', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByEmail).mockResolvedValue(null);

      await repo.findByEmail('missing@example.com');
      await repo.findByEmail('missing@example.com');
      expect(inner.findByEmail).toHaveBeenCalledOnce();
    });
  });

  describe('findAll', () => {
    it('always passes through to inner without caching', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAll).mockResolvedValue([user]);

      const r1 = await repo.findAll();
      const r2 = await repo.findAll();
      expect(r1).toEqual([user]);
      expect(r2).toEqual([user]);
      expect(inner.findAll).toHaveBeenCalledTimes(2);
    });
  });

  describe('findByBackupEmail', () => {
    it('always passes through to inner without caching', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByBackupEmail).mockResolvedValue(user);

      const r1 = await repo.findByBackupEmail('backup@example.com');
      const r2 = await repo.findByBackupEmail('backup@example.com');
      expect(r1).toEqual(user);
      expect(r2).toEqual(user);
      expect(inner.findByBackupEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('delegates to inner and invalidates a stale "not found" email cache entry', async () => {
      const { repo, inner } = makeRepo();
      // Simulate RegisterUseCase's duplicate-email check caching a null result
      // before the user is actually created.
      vi.mocked(inner.findByEmail).mockResolvedValueOnce(null);
      await repo.findByEmail('new@example.com');
      expect(inner.findByEmail).toHaveBeenCalledOnce();

      const created = makeUser({ id: 'user-2', email: 'new@example.com' });
      vi.mocked(inner.create).mockResolvedValue(created);
      await repo.create({ id: 'user-2', email: 'new@example.com' });

      vi.mocked(inner.findByEmail).mockResolvedValueOnce(created);
      const result = await repo.findByEmail('new@example.com');
      expect(result).toEqual(created);
      expect(inner.findByEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('invalidates the byId cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);
      await repo.findById('user-1');
      expect(inner.findById).toHaveBeenCalledOnce();

      vi.mocked(inner.update).mockResolvedValue({ ...user, name: 'Updated Name' });
      await repo.update('user-1', { name: 'Updated Name' });

      vi.mocked(inner.findById).mockResolvedValue({ ...user, name: 'Updated Name' });
      await repo.findById('user-1');
      expect(inner.findById).toHaveBeenCalledTimes(2);
    });

    it('invalidates the byId cache when the plan changes, so the new plan is read straight away', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);
      await repo.findById('user-1');

      vi.mocked(inner.update).mockResolvedValue({ ...user, plan: 'pro', planSource: 'grant' });
      await repo.update('user-1', { plan: 'pro', planSource: 'grant', planExpiresAt: null });

      vi.mocked(inner.findById).mockResolvedValue({ ...user, plan: 'pro', planSource: 'grant' });
      const reloaded = await repo.findById('user-1');
      expect(inner.findById).toHaveBeenCalledTimes(2);
      expect(reloaded?.plan).toBe('pro');
    });

    it('invalidates both the old and new email cache entries when the email changes', async () => {
      const { repo, inner } = makeRepo();
      // Populate the byEmail cache under the old address (also records old→id mapping).
      vi.mocked(inner.findByEmail).mockResolvedValue(user);
      await repo.findByEmail('test@example.com');
      expect(inner.findByEmail).toHaveBeenCalledOnce();

      const updated = { ...user, email: 'new-address@example.com' };
      vi.mocked(inner.update).mockResolvedValue(updated);
      await repo.update('user-1', { email: 'new-address@example.com' });

      // Old email must be a cache miss — the update invalidated it.
      vi.mocked(inner.findByEmail).mockResolvedValueOnce(null);
      await repo.findByEmail('test@example.com');
      expect(inner.findByEmail).toHaveBeenCalledTimes(2);

      // New email must also be a cache miss — never cached under this key before.
      vi.mocked(inner.findByEmail).mockResolvedValueOnce(updated);
      await repo.findByEmail('new-address@example.com');
      expect(inner.findByEmail).toHaveBeenCalledTimes(3);
    });

    it('does not redundantly invalidate the email cache when the email is unchanged', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByEmail).mockResolvedValue(user);
      await repo.findByEmail('test@example.com');

      vi.mocked(inner.update).mockResolvedValue(user);
      await repo.update('user-1', { name: 'Updated Name' });

      // The same email must still be a cache miss post-update (byEmail is
      // always invalidated on update, changed or not) — this just confirms it
      // doesn't throw or double-invalidate when old === new.
      vi.mocked(inner.findByEmail).mockResolvedValueOnce(user);
      await repo.findByEmail('test@example.com');
      expect(inner.findByEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('delegates to inner and invalidates byId and byEmail caches when known', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);
      vi.mocked(inner.findByEmail).mockResolvedValue(user);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.findById('user-1');
      await repo.findByEmail('test@example.com');

      await repo.delete('user-1');

      vi.mocked(inner.findById).mockResolvedValue(null);
      vi.mocked(inner.findByEmail).mockResolvedValue(null);
      await repo.findById('user-1');
      await repo.findByEmail('test@example.com');
      expect(inner.findById).toHaveBeenCalledTimes(2);
      expect(inner.findByEmail).toHaveBeenCalledTimes(2);
    });

    it('still deletes from inner even when email is unknown', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.delete('unknown-id');
      expect(inner.delete).toHaveBeenCalledWith('unknown-id');
    });
  });

  describe('updateLastDigestSentAt', () => {
    it('delegates to inner and invalidates the byId cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(user);
      await repo.findById('user-1');
      expect(inner.findById).toHaveBeenCalledOnce();

      const sentAt = new Date('2024-06-01');
      await repo.updateLastDigestSentAt('user-1', sentAt);
      expect(inner.updateLastDigestSentAt).toHaveBeenCalledWith('user-1', sentAt);

      vi.mocked(inner.findById).mockResolvedValue({ ...user, lastDigestSentAt: sentAt });
      await repo.findById('user-1');
      expect(inner.findById).toHaveBeenCalledTimes(2);
    });
  });
});
