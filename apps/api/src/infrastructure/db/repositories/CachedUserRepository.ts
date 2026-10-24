import type { User } from '#src/domain/user/User.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { BoundedMap } from '#src/infrastructure/cache/BoundedMap.js';
import { CACHE, CACHE_KEYS } from '#src/infrastructure/config/constants.js';

interface Deps {
  drizzleUserRepository: IUserRepository;
  cache: ICache;
}

export class CachedUserRepository implements IUserRepository {
  // Tracks the last-cached email per user id so update() — which can change the
  // email itself — can invalidate the *old* email's cache entry, not just the new one.
  private readonly emailByUserId = new BoundedMap<string, string>(CACHE.REVERSE_INDEX_MAX_ENTRIES);
  private readonly inner: IUserRepository;
  private readonly cache: ICache;

  constructor({ drizzleUserRepository, cache }: Deps) {
    this.inner = drizzleUserRepository;
    this.cache = cache;
  }

  async findById(id: string): Promise<User | null> {
    const key = CACHE_KEYS.userById(id);
    const result = await this.cache.getOrSet(key, () => this.inner.findById(id));
    if (result) this.emailByUserId.set(id, result.email);
    return result;
  }

  async findByEmail(email: string): Promise<User | null> {
    const key = CACHE_KEYS.userByEmail(email);
    const result = await this.cache.getOrSet(key, () => this.inner.findByEmail(email));
    if (result) this.emailByUserId.set(result.id, result.email);
    return result;
  }

  // Only used by the weekly-digest cron batch job — a one-shot read, not a hot
  // path. Caching it would mean invalidating on every single user create/update
  // for a query that runs once a week, so it passes straight through.
  findAll(): Promise<User[]> {
    return this.inner.findAll();
  }

  // Not cached: only two low-frequency, already-rate-limited call sites
  // (backup-email recovery request and add-backup-email verification) — not
  // worth a third cache key/invalidation path for.
  findByBackupEmail(email: string): Promise<User | null> {
    return this.inner.findByBackupEmail(email);
  }

  // Not cached: read by the payment webhook only, and always for a write that follows.
  findByBillingCustomerId(customerId: string): Promise<User | null> {
    return this.inner.findByBillingCustomerId(customerId);
  }

  async create(data: {
    id: string;
    email: string;
    passwordHash?: string | null;
    name?: string | null;
    emailVerifiedAt?: Date | null;
  }): Promise<User> {
    const result = await this.inner.create(data);
    this.emailByUserId.set(result.id, result.email);
    // RegisterUseCase/LoginOrSignupWithOAuthUseCase call findByEmail() first to
    // check for a duplicate, which may have cached a "not found" result for this
    // exact email — clear it so the new user is immediately visible to that check.
    await this.cache.delete(CACHE_KEYS.userByEmail(result.email));
    return result;
  }

  async update(id: string, data: Parameters<IUserRepository['update']>[1]): Promise<User> {
    const result = await this.inner.update(id, data);
    const oldEmail = this.emailByUserId.get(id);
    await this.cache.delete(CACHE_KEYS.userById(id));
    await this.cache.delete(CACHE_KEYS.userByEmail(result.email));
    if (oldEmail && oldEmail !== result.email) {
      await this.cache.delete(CACHE_KEYS.userByEmail(oldEmail));
    }
    this.emailByUserId.set(id, result.email);
    return result;
  }

  async delete(id: string): Promise<void> {
    const email = this.emailByUserId.get(id);
    await this.inner.delete(id);
    await this.cache.delete(CACHE_KEYS.userById(id));
    this.emailByUserId.delete(id);
    if (email) await this.cache.delete(CACHE_KEYS.userByEmail(email));
  }

  async updateLastDigestSentAt(id: string, sentAt: Date): Promise<void> {
    await this.inner.updateLastDigestSentAt(id, sentAt);
    await this.cache.delete(CACHE_KEYS.userById(id));
  }
}
