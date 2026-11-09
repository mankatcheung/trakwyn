/** A page the briefing was written from, shown beside it so a claim can be checked. */
export interface CompanySource {
  url: string;
  title: string;
}

export interface CompanyBriefing {
  id: string;
  applicationId: string;
  content: string;
  /** Empty when no page could be read and the briefing is the model's general knowledge. */
  sources: CompanySource[];
  generatedAt: Date;
}
