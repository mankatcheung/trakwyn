/** A page the briefing was written from, shown beside it so a claim can be checked. */
export interface CompanySource {
  url: string;
  title: string;
  /**
   * When a search result was published (ISO 8601), so a dated claim can be
   * told from an old one (JEF-538). Absent for the company's own pages and
   * for briefings saved before search existed, so old rows need no migration.
   */
  publishedAt?: string | null;
}

export interface CompanyBriefing {
  id: string;
  applicationId: string;
  content: string;
  /** Empty when no page could be read and the briefing is the model's general knowledge. */
  sources: CompanySource[];
  generatedAt: Date;
}
