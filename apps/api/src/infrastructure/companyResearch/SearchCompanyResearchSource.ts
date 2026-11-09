import type {
  CompanyResearch,
  CompanyResearchPage,
  CompanyResearchQuery,
  ICompanyResearchSource,
} from '#src/use-cases/ports/ICompanyResearchSource.js';
import type {
  IWebSearchProvider,
  WebSearchResult,
} from '#src/use-cases/ports/IWebSearchProvider.js';
import { COMPANY_SEARCH } from '#src/infrastructure/config/constants.js';
import { companySiteOrigin } from './companySite.js';
import { cleanCompanyName } from './companyQuery.js';

interface Deps {
  searchProvider: IWebSearchProvider;
}

const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);

function titleOf(result: WebSearchResult): string {
  const title = result.title.replace(/\s+/g, ' ').trim().slice(0, COMPANY_SEARCH.MAX_TITLE_CHARS);
  return title || new URL(result.url).hostname;
}

function toPage(result: WebSearchResult): CompanyResearchPage | null {
  if (!isWebUrl(result.url)) return null;
  const text = result.snippet
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COMPANY_SEARCH.MAX_SNIPPET_CHARS);
  if (!text) return null;
  try {
    return { url: result.url, title: titleOf(result), text, publishedAt: result.publishedAt };
  } catch {
    // A result whose address does not parse has no host to title it by.
    return null;
  }
}

/**
 * What others say about a company (JEF-538): news, funding, layoffs and
 * reviews, from a web search Trakwyn pays for. Two searches, a dated `news`
 * one and a `general` one for reviews, so the briefing can cite either.
 *
 * Only the company name and the site's host go into a query, never anything
 * about the user or the application. The host tells apart companies that
 * share a name; the name is cleaned first so it cannot add operators.
 *
 * Resolves `null` when nothing usable came back. Throws only when **both**
 * searches failed, so the caller can tell a failure from an empty answer;
 * one failing is not an error, the other's results are used.
 */
export class SearchCompanyResearchSource implements ICompanyResearchSource {
  constructor(private readonly deps: Deps) {}

  async research(query: CompanyResearchQuery): Promise<CompanyResearch | null> {
    const name = cleanCompanyName(query.company);
    if (!name) return null;

    const origin = companySiteOrigin(query.jobUrl);
    const subject = origin ? `"${name}" ${new URL(origin).hostname}` : `"${name}"`;

    const [news, general] = await Promise.allSettled([
      this.deps.searchProvider.search({
        query: `${subject} news funding layoffs`,
        topic: 'news',
        maxResults: COMPANY_SEARCH.MAX_RESULTS,
        days: COMPANY_SEARCH.NEWS_DAYS,
      }),
      this.deps.searchProvider.search({
        query: `${subject} employee reviews culture`,
        topic: 'general',
        maxResults: COMPANY_SEARCH.MAX_RESULTS,
      }),
    ]);

    if (news.status === 'rejected' && general.status === 'rejected') throw news.reason;

    const seen = new Set<string>();
    const pages: CompanyResearchPage[] = [];
    for (const settled of [news, general]) {
      if (settled.status !== 'fulfilled') continue;
      for (const result of settled.value) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        const page = toPage(result);
        if (page) pages.push(page);
      }
    }

    return pages.length > 0 ? { pages } : null;
  }
}
