import type { Document } from '#src/domain/document/Document.js';
import type {
  IDocumentRepository,
  CreateDocumentData,
} from '#src/use-cases/ports/IDocumentRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { CACHE_KEYS } from '#src/infrastructure/config/constants.js';

interface Deps {
  drizzleDocumentRepository: IDocumentRepository;
  drizzleApplicationRepository: IApplicationRepository;
  cache: ICache;
}

export class CachedDocumentRepository implements IDocumentRepository {
  private readonly inner: IDocumentRepository;
  private readonly applications: IApplicationRepository;
  private readonly cache: ICache;

  constructor({ drizzleDocumentRepository, drizzleApplicationRepository, cache }: Deps) {
    this.inner = drizzleDocumentRepository;
    this.applications = drizzleApplicationRepository;
    this.cache = cache;
  }

  /**
   * Creating or deleting a document changes the owner's `documentBytes`
   * (JEF-425), which `CachedUserRepository` serves to `me` and the early
   * storage check. Without this they would keep the old total until the entry
   * expired. Read straight from the database, trashed applications included,
   * since their documents still count.
   */
  private async dropOwnerCache(applicationId: string): Promise<void> {
    const app = await this.applications.findByIdIncludingTrashed(applicationId);
    if (app) await this.cache.delete(CACHE_KEYS.userById(app.userId));
  }

  async findAllByApplicationId(applicationId: string): Promise<Document[]> {
    const key = CACHE_KEYS.docList(applicationId);
    return this.cache.getOrSet(key, () => this.inner.findAllByApplicationId(applicationId));
  }

  async countByApplicationId(applicationId: string): Promise<number> {
    return this.inner.countByApplicationId(applicationId);
  }

  // Not cached: this reads across every application for the user, which
  // doesn't fit the per-applicationId cache key scheme used above, and
  // invalidating it correctly would require busting it on every document
  // create/delete for any of the user's applications.
  async findAllByUserId(userId: string): Promise<Document[]> {
    return this.inner.findAllByUserId(userId);
  }

  async findById(id: string): Promise<Document | null> {
    const key = CACHE_KEYS.docById(id);
    return this.cache.getOrSet(key, () => this.inner.findById(id));
  }

  async create(data: CreateDocumentData): Promise<Document> {
    const result = await this.inner.create(data);
    await this.cache.delete(CACHE_KEYS.docList(result.applicationId));
    await this.dropOwnerCache(result.applicationId);
    return result;
  }

  async delete(id: string, applicationId: string): Promise<void> {
    await this.inner.delete(id, applicationId);
    await this.cache.delete(CACHE_KEYS.docById(id));
    await this.cache.delete(CACHE_KEYS.docList(applicationId));
    await this.dropOwnerCache(applicationId);
  }
}
