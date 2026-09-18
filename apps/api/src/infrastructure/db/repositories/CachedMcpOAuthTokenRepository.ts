import type { McpOAuthAccessToken } from '#src/domain/mcpOAuth/McpOAuthAccessToken.js';
import type {
  CreateMcpOAuthAccessTokenData,
  IMcpOAuthTokenRepository,
} from '#src/use-cases/ports/IMcpOAuthTokenRepository.js';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import { CACHE, CACHE_KEYS } from '#src/infrastructure/config/constants.js';

interface Deps {
  drizzleMcpOAuthTokenRepository: IMcpOAuthTokenRepository;
  cache: ICache;
}

/**
 * Caches the token lookup every MCP request performs.
 *
 * Uncached, `POST /mcp` cost two database round trips — a read to identify the
 * caller and a write to stamp lastUsedAt — before any tool ran.
 *
 * Caching a bearer credential is only safe because the cached row carries its
 * own `revokedAt` and `expiresAt`, and `ValidateMcpOAuthAccessTokenUseCase`
 * checks both. An expired token is therefore rejected from cache exactly as it
 * would be from the database. Revocation is the case that needs handling: a row
 * cached while live says `revokedAt: null`, and would go on saying so. That is
 * what `revokeFamily` below is for, with `CACHE.TOKEN_TTL_MS` as the ceiling if
 * it is ever missed rather than as the thing keeping it correct.
 */
export class CachedMcpOAuthTokenRepository implements IMcpOAuthTokenRepository {
  private readonly inner: IMcpOAuthTokenRepository;
  private readonly cache: ICache;

  constructor({ drizzleMcpOAuthTokenRepository, cache }: Deps) {
    this.inner = drizzleMcpOAuthTokenRepository;
    this.cache = cache;
  }

  async create(data: CreateMcpOAuthAccessTokenData): Promise<McpOAuthAccessToken> {
    return this.inner.create(data);
  }

  async findByTokenHash(tokenHash: string): Promise<McpOAuthAccessToken | null> {
    return this.cache.getOrSet(
      CACHE_KEYS.mcpOAuthTokenByHash(tokenHash),
      () => this.inner.findByTokenHash(tokenHash),
      CACHE.TOKEN_TTL_MS,
    );
  }

  /**
   * Throttled to one write per token per window.
   *
   * There is no plain `get` on ICache, so the presence of the key is read by
   * seeing whether `getOrSet` had to call its fetch — the same inference
   * `InstrumentedCache` uses to tell a hit from a miss (JEF-129). The first
   * caller in a window populates the key and writes; everyone after it finds
   * the key and skips the database entirely.
   *
   * The cached token row keeps its old `lastUsedAt`, which does not matter:
   * nothing reads it from here. The settings list reads it through
   * `DrizzleMcpOAuthGrantRepository`, which is uncached and goes to the row.
   */
  async updateLastUsed(id: string): Promise<void> {
    let firstInWindow = false;
    await this.cache.getOrSet(
      CACHE_KEYS.mcpOAuthTokenLastUsed(id),
      async () => {
        firstInWindow = true;
        return 1;
      },
      CACHE.TOKEN_LAST_USED_TTL_MS,
    );
    if (firstInWindow) await this.inner.updateLastUsed(id);
  }

  async revoke(id: string): Promise<void> {
    return this.inner.revoke(id);
  }

  /**
   * Revocation has to reach the cache or it does not reach anything: a request
   * arriving a second later would be served the row as it was before, still
   * saying it is live.
   *
   * The inner call reports which hashes it revoked, so exactly those keys are
   * dropped — no second query to discover them, and no chance of the two
   * disagreeing.
   */
  async revokeFamily(familyId: string, revokedAt: Date): Promise<string[]> {
    const revokedHashes = await this.inner.revokeFamily(familyId, revokedAt);
    await Promise.all(
      revokedHashes.map((hash) => this.cache.delete(CACHE_KEYS.mcpOAuthTokenByHash(hash))),
    );
    return revokedHashes;
  }
}
