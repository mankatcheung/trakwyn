import { describe, it, expect, vi } from 'vitest';
import { CachedApplicationRepository } from '#src/infrastructure/db/repositories/CachedApplicationRepository.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { CACHE_KEYS } from '#src/infrastructure/config/constants.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

function makeRepo() {
  const inner = makeApplicationRepository();
  const cache = new MemoryCache(60_000);
  const repo = new CachedApplicationRepository({
    drizzleApplicationRepository: inner,
    cache,
  });
  return { repo, inner, cache };
}

const app = makeApplication();

describe('CachedApplicationRepository', () => {
  describe('findAllByUserId', () => {
    it('fetches from inner on first call and populates cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);

      const result = await repo.findAllByUserId('user-1');
      expect(result).toEqual([app]);
      expect(inner.findAllByUserId).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call without hitting inner', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);

      await repo.findAllByUserId('user-1');
      const result = await repo.findAllByUserId('user-1');
      expect(result).toEqual([app]);
      expect(inner.findAllByUserId).toHaveBeenCalledOnce();
    });

    it('uses separate cache keys for different users', async () => {
      const { repo, inner } = makeRepo();
      const app2 = makeApplication({ id: 'app-2', userId: 'user-2' });
      vi.mocked(inner.findAllByUserId).mockResolvedValueOnce([app]).mockResolvedValueOnce([app2]);

      const r1 = await repo.findAllByUserId('user-1');
      const r2 = await repo.findAllByUserId('user-2');
      expect(r1).toEqual([app]);
      expect(r2).toEqual([app2]);
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });

    it('uses separate cache keys for different status filters', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);

      await repo.findAllByUserId('user-1', { status: 'applied' });
      await repo.findAllByUserId('user-1', { status: 'interviewing' });
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });
  });

  describe('findById', () => {
    it('fetches from inner on first call', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(app);

      const result = await repo.findById('app-1');
      expect(result).toEqual(app);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(app);

      await repo.findById('app-1');
      const result = await repo.findById('app-1');
      expect(result).toEqual(app);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('caches null when application is not found', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(null);

      await repo.findById('missing');
      await repo.findById('missing');
      expect(inner.findById).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    it('delegates to inner and invalidates the user list cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByUserId).mockResolvedValue([]);
      vi.mocked(inner.create).mockResolvedValue(app);

      // Populate list cache
      await repo.findAllByUserId('user-1');
      expect(inner.findAllByUserId).toHaveBeenCalledOnce();

      // Create should bust the cache
      await repo.create({
        id: 'app-1',
        userId: 'user-1',
        company: 'Acme',
        role: 'SWE',
        status: 'draft',
      });

      // Next list fetch must go to inner again
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      await repo.findAllByUserId('user-1');
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('delegates to inner, invalidates byId and list caches', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(app);
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      vi.mocked(inner.update).mockResolvedValue({ ...app, company: 'Updated' });

      // Populate caches
      await repo.findById('app-1');
      await repo.findAllByUserId('user-1');

      await repo.update('app-1', { company: 'Updated' });

      // Both caches must be gone
      vi.mocked(inner.findById).mockResolvedValue({ ...app, company: 'Updated' });
      vi.mocked(inner.findAllByUserId).mockResolvedValue([{ ...app, company: 'Updated' }]);
      await repo.findById('app-1');
      await repo.findAllByUserId('user-1');
      expect(inner.findById).toHaveBeenCalledTimes(2);
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('looks the app up including trashed ones, then invalidates byId and list caches', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByIdIncludingTrashed).mockResolvedValue(app);
      vi.mocked(inner.findById).mockResolvedValue(app);
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.findAllByUserId('user-1');
      await repo.delete('app-1');

      expect(inner.findByIdIncludingTrashed).toHaveBeenCalledWith('app-1');
      vi.mocked(inner.findById).mockResolvedValue(null);
      vi.mocked(inner.findAllByUserId).mockResolvedValue([]);
      await repo.findById('app-1');
      await repo.findAllByUserId('user-1');
      // Once: only the explicit read above. `delete` itself now goes through
      // findByIdIncludingTrashed.
      expect(inner.findById).toHaveBeenCalledTimes(1);
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });

    it('invalidates the list cache from a second repo instance that never read the app locally (simulates a different serverless instance sharing the same Redis-backed cache)', async () => {
      const inner = makeApplicationRepository();
      const cache = new MemoryCache(60_000);
      const repoA = new CachedApplicationRepository({ drizzleApplicationRepository: inner, cache });
      const repoB = new CachedApplicationRepository({ drizzleApplicationRepository: inner, cache });

      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      vi.mocked(inner.findByIdIncludingTrashed).mockResolvedValue(app);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      // repoA warms the list cache, as if an earlier request landed on a different instance
      await repoA.findAllByUserId('user-1');

      // repoB has no local state whatsoever, yet must still invalidate correctly
      await repoB.delete('app-1');

      vi.mocked(inner.findAllByUserId).mockResolvedValue([]);
      await repoA.findAllByUserId('user-1');
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });

    it('busts the Trash list when a trashed application is destroyed', async () => {
      // Regression: `delete` used to look the row up with `findById`, which
      // filters trashed rows out. Permanent delete and the purge only ever act
      // on trashed rows, so the lookup always returned null, the userId was
      // never learned, and neither the list nor the Trash cache was cleared —
      // an application deleted for good kept appearing in Trash until the
      // entry expired by itself.
      const { repo, inner } = makeRepo();
      const trashedApp = makeApplication({ deletedAt: new Date('2026-08-01') });
      vi.mocked(inner.findById).mockResolvedValue(null); // trashed: filtered out
      vi.mocked(inner.findByIdIncludingTrashed).mockResolvedValue(trashedApp);
      vi.mocked(inner.findTrashedByUserId).mockResolvedValue([trashedApp]);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.findTrashedByUserId('user-1'); // warms the Trash list cache
      await repo.delete('app-1');

      vi.mocked(inner.findTrashedByUserId).mockResolvedValue([]);
      expect(await repo.findTrashedByUserId('user-1')).toEqual([]);
      expect(inner.findTrashedByUserId).toHaveBeenCalledTimes(2);
    });

    it('still deletes from inner even when the app is not found', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findByIdIncludingTrashed).mockResolvedValue(null);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.delete('unknown-id');
      expect(inner.delete).toHaveBeenCalledWith('unknown-id');
    });
  });

  describe('updateReminderSentAt', () => {
    it('looks up the app via its own findById, then invalidates byId and list caches', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(app);
      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      vi.mocked(inner.updateReminderSentAt).mockResolvedValue(undefined);

      await repo.findAllByUserId('user-1');
      await repo.updateReminderSentAt('app-1', new Date());

      expect(inner.findById).toHaveBeenCalledWith('app-1');
      const updated = { ...app, reminderSentAt: new Date() };
      vi.mocked(inner.findAllByUserId).mockResolvedValue([updated]);
      await repo.findAllByUserId('user-1');
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });

    it('invalidates the list cache from a second repo instance that never read the app locally (simulates the background reminder job landing on a different serverless instance than an earlier dashboard read)', async () => {
      const inner = makeApplicationRepository();
      const cache = new MemoryCache(60_000);
      const repoA = new CachedApplicationRepository({ drizzleApplicationRepository: inner, cache });
      const repoB = new CachedApplicationRepository({ drizzleApplicationRepository: inner, cache });

      vi.mocked(inner.findAllByUserId).mockResolvedValue([app]);
      vi.mocked(inner.findDueForReminder).mockResolvedValue([app]);
      vi.mocked(inner.findById).mockResolvedValue(app);
      vi.mocked(inner.updateReminderSentAt).mockResolvedValue(undefined);

      // repoA warms the list cache (e.g. an earlier dashboard read on a different instance)
      await repoA.findAllByUserId('user-1');

      // repoB discovers the due app via the uncached finder and marks it sent,
      // with no local state carried over from repoA
      await repoB.findDueForReminder();
      await repoB.updateReminderSentAt(app.id, new Date());

      const updated = { ...app, reminderSentAt: new Date() };
      vi.mocked(inner.findAllByUserId).mockResolvedValue([updated]);
      await repoA.findAllByUserId('user-1');
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });

    it('still updates via inner even when the app is not found', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(null);
      vi.mocked(inner.updateReminderSentAt).mockResolvedValue(undefined);

      await repo.updateReminderSentAt('unknown-id', new Date());
      expect(inner.updateReminderSentAt).toHaveBeenCalledWith('unknown-id', expect.any(Date));
    });
  });
  it('drops the owner from the user cache when an application is deleted for good (its documents release bytes)', async () => {
    const { repo, inner, cache } = makeRepo();
    vi.mocked(inner.findByIdIncludingTrashed).mockResolvedValue(app);
    vi.mocked(inner.delete).mockResolvedValue(undefined);
    await cache.getOrSet(CACHE_KEYS.userById(app.userId), async () => ({ documentBytes: 500 }));

    await repo.delete(app.id);

    expect(
      await cache.getOrSet(CACHE_KEYS.userById(app.userId), async () => ({ documentBytes: 0 })),
    ).toEqual({ documentBytes: 0 });
  });
});
