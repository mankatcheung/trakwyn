import type { CompanyBriefing } from '#src/domain/companyBriefing/CompanyBriefing.js';

export interface CompanySourceDTO {
  url: string;
  title: string;
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
      sources: briefing.sources.map(({ url, title }) => ({ url, title })),
      generatedAt: briefing.generatedAt.toISOString(),
    };
  }
}
