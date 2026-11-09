import type { ICache } from '#src/infrastructure/cache/ICache.js';
import type {
  CompanyResearch,
  CompanyResearchQuery,
  ICompanyResearchSource,
} from '#src/use-cases/ports/ICompanyResearchSource.js';
import { COMPANY_RESEARCH } from '#src/infrastructure/config/constants.js';
import { companySiteOrigin } from './companySite.js';

interface Deps {
  cache: ICache;
  inner: ICompanyResearchSource;
}

/**
 * Shares what was read from a company's site between users (JEF-475): many
 * people apply to the same companies, so the site is fetched once per host
 * per `COMPANY_RESEARCH.TTL_MS`, and `getOrSet` makes two simultaneous first
 * briefings fetch it once between them. Keyed on the host alone, never on the
 * posting link, so nothing about one user's application is visible to another.
 *
 * An empty answer is not kept: a site that was down for a minute must not
 * leave every briefing for that company without sources for a week.
 */
export class CachedCompanyResearchSource implements ICompanyResearchSource {
  constructor(private readonly deps: Deps) {}

  async research(query: CompanyResearchQuery): Promise<CompanyResearch | null> {
    const origin = companySiteOrigin(query.jobUrl);
    if (!origin) return null;

    const key = `${COMPANY_RESEARCH.KEY_PREFIX}:${COMPANY_RESEARCH.VERSION}:${new URL(origin).hostname}`;
    const result = await this.deps.cache.getOrSet<CompanyResearch | null>(
      key,
      () => this.deps.inner.research(query),
      COMPANY_RESEARCH.TTL_MS,
    );

    if (result === null) await this.deps.cache.delete(key);
    return result;
  }
}
