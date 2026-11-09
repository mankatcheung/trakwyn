import type {
  CompanyResearch,
  CompanyResearchPage,
  CompanyResearchQuery,
  ICompanyResearchSource,
} from '#src/use-cases/ports/ICompanyResearchSource.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import { COMPANY_RESEARCH } from '#src/infrastructure/config/constants.js';
import { readBounded } from '#src/infrastructure/net/readBounded.js';
import { companySiteOrigin } from './companySite.js';
import { readableText } from './pageText.js';

interface Deps {
  outboundUrlPolicy: IOutboundUrlPolicy;
}

const TITLE_MAX_CHARS = 120;

/**
 * Reads the company's homepage and its about page, from the posting link's
 * host (JEF-475). The host comes from a user-entered URL and the server opens
 * it from inside its own network, so it goes through `IOutboundUrlPolicy`
 * before every request and every redirect hop, as the job-posting fetch does.
 * Only the root and a fixed list of about paths are ever requested, so a
 * posting link's own path and query never reach the company's server.
 *
 * Nothing here throws for a site that is down, slow, refuses us or is not
 * HTML: that page is skipped, and when none is left the answer is `null`.
 */
export class FetchCompanySiteResearchSource implements ICompanyResearchSource {
  constructor(private readonly deps: Deps) {}

  async research(query: CompanyResearchQuery): Promise<CompanyResearch | null> {
    const origin = companySiteOrigin(query.jobUrl);
    if (!origin) return null;

    const pages: CompanyResearchPage[] = [];

    const home = await this.readPage(origin);
    if (home) pages.push(home);

    for (const path of COMPANY_RESEARCH.ABOUT_PATHS) {
      const about = await this.readPage(`${origin}${path}`);
      if (about) {
        pages.push(about);
        break;
      }
    }

    return pages.length > 0 ? { pages } : null;
  }

  private async readPage(url: string): Promise<CompanyResearchPage | null> {
    try {
      const fetched = await this.fetchHtml(url);
      if (!fetched) return null;

      const text = readableText(this.contentRegion(fetched.html) ?? fetched.html).slice(
        0,
        COMPANY_RESEARCH.MAX_CHARS_PER_PAGE,
      );
      if (text.length < COMPANY_RESEARCH.MIN_PAGE_CHARS) return null;

      return { url: fetched.finalUrl, title: this.titleOf(fetched.html, fetched.finalUrl), text };
    } catch {
      // A refused URL, a timeout and a reset connection all mean the same
      // thing here: this page is not available, so the briefing goes without it.
      return null;
    }
  }

  private async fetchHtml(initialUrl: string): Promise<{ html: string; finalUrl: string } | null> {
    let url = initialUrl;
    for (let hop = 0; hop <= COMPANY_RESEARCH.MAX_REDIRECTS; hop++) {
      await this.deps.outboundUrlPolicy.assertAllowed(url, 'company-research');

      const response = await fetch(url, {
        headers: { 'User-Agent': COMPANY_RESEARCH.USER_AGENT, Accept: 'text/html;q=1' },
        signal: AbortSignal.timeout(COMPANY_RESEARCH.TIMEOUT_MS),
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get('location');
        if (!location) return null;
        url = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) return null;
      if (!/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) return null;

      return { html: await readBounded(response.body, COMPANY_RESEARCH.MAX_BYTES), finalUrl: url };
    }
    return null;
  }

  /** The `<main>` block when the page marks one with a real amount of text; the whole page otherwise. */
  private contentRegion(html: string): string | null {
    const main = /<main\b[^>]*>[\s\S]*?<\/main>/i.exec(html)?.[0];
    return main && readableText(main).length >= COMPANY_RESEARCH.MIN_PAGE_CHARS ? main : null;
  }

  private titleOf(html: string, url: string): string {
    const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const title = raw
      ? readableText(raw).replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_CHARS)
      : '';
    return title || new URL(url).hostname;
  }
}
