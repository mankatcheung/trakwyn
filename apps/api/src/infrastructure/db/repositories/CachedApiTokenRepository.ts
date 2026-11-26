import type { ApiToken } from '#src/domain/apiToken/ApiToken.js';
import type {
  IApiTokenRepository,
  CreateApiTokenData,
} from '#src/use-cases/ports/IApiTokenRepository.js';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { CACHE, CACHE_KEYS } from '#src/infrastructure/config/constants.js';
import { afterCommit } from '#src/infrastructure/db/transactionContext.js';

interface Deps {
  drizzleApiTokenRepository: IApiTokenRepository;
  cache: ICache;
}

export class CachedApiTokenRepository implements IApiTokenRepository {
  private readonly inner: IApiTokenRepository;
  private readonly cache: ICache;

  constructor({ drizzleApiTokenRepository, cache }: Deps) {
    this.inner = drizzleApiTokenRepository;
    this.cache = cache;
  }

  async findAllByUserId(userId: string): Promise<ApiToken[]> {
    const key = CACHE_KEYS.apiTokenList(userId);
    return this.cache.getOrSet(key, () => this.inner.findAllByUserId(userId));
  }

  async findById(id: string): Promise<ApiToken | null> {
    const key = CACHE_KEYS.apiTokenById(id);
    return this.cache.getOrSet(key, () => this.inner.findById(id));
  }

  async findByTokenHash(tokenHash: string): Promise<{ token: ApiToken; userEmail: string } | null> {
    const key = CACHE_KEYS.apiTokenByHash(tokenHash);
    return this.cache.getOrSet(key, () => this.inner.findByTokenHash(tokenHash));
  }

  async findByIdAndUserId(id: string, userId: string): Promise<ApiToken | null> {
    return this.inner.findByIdAndUserId(id, userId);
  }

  async create(data: CreateApiTokenData): Promise<ApiToken> {
    const result = await this.inner.create(data);
    await this.cache.delete(CACHE_KEYS.apiTokenList(result.userId));
    return result;
  }

  /**
   * Not invalidated: fires on every validated request, so busting
   * findByTokenHash/findById here would defeat the point of caching them.
   *
   * Throttled instead — a remote database write on every request, from a
   * serverless function, is expensive for a field that only feeds a "last
   * used" column in settings, where a minute of granularity reads the same
   * as none. The first caller in each window writes and the rest skip it,
   * detected by whether `getOrSet` had to call its fetch.
   */
  async updateLastUsed(id: string): Promise<void> {
    let firstInWindow = false;
    await this.cache.getOrSet(
      CACHE_KEYS.apiTokenLastUsed(id),
      async () => {
        firstInWindow = true;
        return 1;
      },
      CACHE.TOKEN_LAST_USED_TTL_MS,
    );
    if (firstInWindow) await this.inner.updateLastUsed(id);
  }

  async delete(id: string): Promise<void> {
    // Looked up via our own cached findById (Redis-backed in prod) rather
    // than a process-local map, so this stays correct even when the lookup
    // and the delete land on different serverless instances.
    const existing = await this.findById(id);
    await this.inner.delete(id);
    const evict = async () => {
      await this.cache.delete(CACHE_KEYS.apiTokenById(id));
      if (existing) {
        await this.cache.delete(CACHE_KEYS.apiTokenByHash(existing.tokenHash));
        await this.cache.delete(CACHE_KEYS.apiTokenList(existing.userId));
      }
    };
    await evict();
    // Again after the commit, when a delete inside a transaction becomes visible (JEF-694).
    afterCommit(evict);
  }
}
