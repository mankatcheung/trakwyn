import { describe, it, expect, vi } from 'vitest';
import { CachedDocumentRepository } from '#src/infrastructure/db/repositories/CachedDocumentRepository.js';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { makeDocument, makeDocumentRepository } from '#src/__tests__/helpers/mocks/documents.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { CACHE_KEYS } from '#src/infrastructure/config/constants.js';

function makeRepo() {
  const inner = makeDocumentRepository();
  const cache = new MemoryCache(60_000);
  const applications = makeApplicationRepository({
    findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication({ userId: 'user-1' })),
  });
  const repo = new CachedDocumentRepository({
    drizzleDocumentRepository: inner,
    drizzleApplicationRepository: applications,
    cache,
  });
  return { repo, inner, cache, applications };
}

const doc = makeDocument();

describe('CachedDocumentRepository', () => {
  describe('findAllByApplicationId', () => {
    it('fetches from inner on first call and populates cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([doc]);

      const result = await repo.findAllByApplicationId('app-1');
      expect(result).toEqual([doc]);
      expect(inner.findAllByApplicationId).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call without hitting inner', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([doc]);

      await repo.findAllByApplicationId('app-1');
      const result = await repo.findAllByApplicationId('app-1');
      expect(result).toEqual([doc]);
      expect(inner.findAllByApplicationId).toHaveBeenCalledOnce();
    });

    it('uses separate cache keys for different applications', async () => {
      const { repo, inner } = makeRepo();
      const doc2 = makeDocument({ id: 'doc-2', applicationId: 'app-2' });
      vi.mocked(inner.findAllByApplicationId)
        .mockResolvedValueOnce([doc])
        .mockResolvedValueOnce([doc2]);

      const r1 = await repo.findAllByApplicationId('app-1');
      const r2 = await repo.findAllByApplicationId('app-2');
      expect(r1).toEqual([doc]);
      expect(r2).toEqual([doc2]);
      expect(inner.findAllByApplicationId).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAllByUserId', () => {
    it('delegates to inner on every call without caching', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByUserId).mockResolvedValue([doc]);

      const r1 = await repo.findAllByUserId('user-1');
      const r2 = await repo.findAllByUserId('user-1');

      expect(r1).toEqual([doc]);
      expect(r2).toEqual([doc]);
      expect(inner.findAllByUserId).toHaveBeenCalledTimes(2);
    });
  });

  describe('findById', () => {
    it('fetches from inner on first call', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(doc);

      const result = await repo.findById('doc-1');
      expect(result).toEqual(doc);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('returns cached result on second call', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(doc);

      await repo.findById('doc-1');
      const result = await repo.findById('doc-1');
      expect(result).toEqual(doc);
      expect(inner.findById).toHaveBeenCalledOnce();
    });

    it('caches null when document is not found', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(null);

      await repo.findById('missing');
      await repo.findById('missing');
      expect(inner.findById).toHaveBeenCalledOnce();
    });
  });

  describe('create', () => {
    it('delegates to inner and invalidates the application list cache', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([]);
      vi.mocked(inner.create).mockResolvedValue(doc);

      await repo.findAllByApplicationId('app-1');
      expect(inner.findAllByApplicationId).toHaveBeenCalledOnce();

      await repo.create({
        id: 'doc-1',
        applicationId: 'app-1',
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storageKey: 'users/user-1/applications/app-1/resume.pdf',
      });

      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([doc]);
      await repo.findAllByApplicationId('app-1');
      expect(inner.findAllByApplicationId).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('delegates to inner and invalidates byId and list caches', async () => {
      const { repo, inner } = makeRepo();
      vi.mocked(inner.findById).mockResolvedValue(doc);
      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([doc]);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      await repo.findById('doc-1');
      await repo.findAllByApplicationId('app-1');

      await repo.delete('doc-1', 'app-1');

      vi.mocked(inner.findById).mockResolvedValue(null);
      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([]);
      await repo.findById('doc-1');
      await repo.findAllByApplicationId('app-1');
      expect(inner.findById).toHaveBeenCalledTimes(2);
      expect(inner.findAllByApplicationId).toHaveBeenCalledTimes(2);
    });

    it('evicts the list cache from a second repo instance with no prior read on it (JEF-209 — the id→applicationId map this used to depend on is gone)', async () => {
      const inner = makeDocumentRepository();
      const cache = new MemoryCache(60_000);
      const applications = makeApplicationRepository({
        findByIdIncludingTrashed: vi.fn().mockResolvedValue(makeApplication()),
      });
      const deps = {
        drizzleDocumentRepository: inner,
        drizzleApplicationRepository: applications,
        cache,
      };
      const repoA = new CachedDocumentRepository(deps);
      const repoB = new CachedDocumentRepository(deps);

      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([doc]);
      vi.mocked(inner.delete).mockResolvedValue(undefined);

      // repoA warms the list cache; repoB never reads anything before deleting.
      await repoA.findAllByApplicationId('app-1');
      await repoB.delete('doc-1', 'app-1');

      vi.mocked(inner.findAllByApplicationId).mockResolvedValue([]);
      await repoA.findAllByApplicationId('app-1');
      expect(inner.findAllByApplicationId).toHaveBeenCalledTimes(2);
    });
  });
  describe('owner storage total (JEF-425)', () => {
    const cachedUser = async (cache: MemoryCache) => {
      await cache.getOrSet(CACHE_KEYS.userById('user-1'), async () => ({ documentBytes: 0 }));
      return cache.getOrSet(CACHE_KEYS.userById('user-1'), async () => ({ documentBytes: 999 }));
    };

    it('drops the owner from the user cache when a document is created', async () => {
      const { repo, inner, cache } = makeRepo();
      vi.mocked(inner.create).mockResolvedValue(doc);
      expect(await cachedUser(cache)).toEqual({ documentBytes: 0 });

      await repo.create({ ...doc });

      expect(
        await cache.getOrSet(CACHE_KEYS.userById('user-1'), async () => ({ documentBytes: 12345 })),
      ).toEqual({
        documentBytes: 12345,
      });
    });

    it('drops the owner from the user cache when a document is deleted, even from the Trash', async () => {
      const { repo, inner, cache, applications } = makeRepo();
      vi.mocked(inner.delete).mockResolvedValue(undefined);
      await cachedUser(cache);

      await repo.delete('doc-1', 'app-1');

      expect(applications.findByIdIncludingTrashed).toHaveBeenCalledWith('app-1');
      expect(
        await cache.getOrSet(CACHE_KEYS.userById('user-1'), async () => ({ documentBytes: 0 })),
      ).toEqual({
        documentBytes: 0,
      });
    });
  });
});
