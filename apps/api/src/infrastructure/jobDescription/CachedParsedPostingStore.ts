import { createHash } from 'node:crypto';
import type { ICache } from '#src/infrastructure/cache/ICache.js';
import type {
  IParsedPostingCache,
  ParsedPostingResult,
} from '#src/use-cases/ports/IParsedPostingCache.js';
import { PARSED_POSTING_CACHE } from '#src/infrastructure/config/constants.js';

interface Deps {
  cache: ICache;
}

/** The same page with different whitespace in its markup is the same posting. */
export function parsedPostingKey(pageText: string): string {
  const normalised = pageText.replace(/\s+/g, ' ').trim();
  const digest = createHash('sha256').update(normalised).digest('hex');
  return `${PARSED_POSTING_CACHE.KEY_PREFIX}:${PARSED_POSTING_CACHE.VERSION}:${digest}`;
}

/**
 * `IParsedPostingCache` over the shared `ICache` (Redis in production), so a
 * posting that two users paste a link to is parsed once. `getOrSet` also
 * single-flights, so two simultaneous first parses make one model call.
 */
export class CachedParsedPostingStore implements IParsedPostingCache {
  constructor(private readonly deps: Deps) {}

  async getOrParse<T>(pageText: string, parse: () => Promise<T>): Promise<ParsedPostingResult<T>> {
    let parsedHere = false;
    const value = await this.deps.cache.getOrSet<T>(
      parsedPostingKey(pageText),
      async () => {
        parsedHere = true;
        return parse();
      },
      PARSED_POSTING_CACHE.TTL_MS,
    );
    return { value, cached: !parsedHere };
  }
}
