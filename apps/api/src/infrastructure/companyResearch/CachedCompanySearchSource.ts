import type { ICache } from '#src/infrastructure/cache/ICache.js';
import type {
  CompanyResearch,
  CompanyResearchQuery,
  ICompanyResearchSource,
} from '#src/use-cases/ports/ICompanyResearchSource.js';
import { COMPANY_SEARCH } from '#src/infrastructure/config/constants.js';
import { companySiteOrigin } from './companySite.js';
import { cleanCompanyName, companyKeySegment } from './companyQuery.js';

interface Deps {
  cache: ICache;
  inner: ICompanyResearchSource;
}

/**
 * Shares one company's search results between users (JEF-538): every search
 * costs Trakwyn a credit, and many people apply to the same companies. Keyed
 * on the cleaned company name and the site's host (the same two things the
 * query is built from), never on the user or the posting link, so nothing
 * about one application is visible to another.
 *
 * Like the site cache, an empty answer is not kept, and a search that throws
 * is not cached either (the cache stores only what `fetch` returns), so a
 * provider that was down for a minute is retried by the next briefing.
 */
export class CachedCompanySearchSource implements ICompanyResearchSource {
  constructor(private readonly deps: Deps) {}

  async research(query: CompanyResearchQuery): Promise<CompanyResearch | null> {
    const name = cleanCompanyName(query.company);
    if (!name) return null;

    const origin = companySiteOrigin(query.jobUrl);
    const host = origin ? new URL(origin).hostname : 'none';
    const key = `${COMPANY_SEARCH.KEY_PREFIX}:${COMPANY_SEARCH.VERSION}:${companyKeySegment(name)}:${host}`;

    const result = await this.deps.cache.getOrSet<CompanyResearch | null>(
      key,
      () => this.deps.inner.research(query),
      COMPANY_SEARCH.TTL_MS,
    );

    if (result === null) await this.deps.cache.delete(key);
    return result;
  }
}
