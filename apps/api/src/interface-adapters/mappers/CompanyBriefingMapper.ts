import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';

export interface CompanySourceDTO {
  url: string;
  title: string;
  /** ISO 8601; null for the company's own pages and for briefings saved before search existed. */
  publishedAt: string | null;
}

export interface CompanyBriefingDTO {
  id: string;
  applicationId: string;
  content: string;
  sources: CompanySourceDTO[];
  generatedAt: string;
}

export class CompanyBriefingMapper {
  toDTO(briefing: CompanyBriefing): CompanyBriefingDTO {
    return {
      id: briefing.id,
      applicationId: briefing.applicationId,
      content: briefing.content,
      sources: briefing.sources.map(({ url, title, publishedAt }) => ({
        url,
        title,
        publishedAt: publishedAt ?? null,
      })),
      generatedAt: briefing.generatedAt.toISOString(),
    };
  }
}
