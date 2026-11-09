export interface CompanyResearchQuery {
  company: string;
  /** The application's posting link; the company's own site is derived from it when it is not a job board. */
  jobUrl: string | null;
}

/** One page read from the company's site. `text` is third-party content: the caller fences it. */
export interface CompanyResearchPage {
  url: string;
  title: string;
  /** Plain text, already bounded. */
  text: string;
}

export interface CompanyResearch {
  /** In the order the prompt numbers them, `1..n`. Never empty. */
  pages: CompanyResearchPage[];
}

/**
 * Reads what the company says about itself so a briefing does not rest on
 * the model's memory alone. Resolves `null` when nothing could be read (no
 * usable site, every page refused or failed): the briefing then carries on
 * as it did before research existed, so an implementation never throws for
 * an unreachable site.
 */
export interface ICompanyResearchSource {
  research(query: CompanyResearchQuery): Promise<CompanyResearch | null>;
}
