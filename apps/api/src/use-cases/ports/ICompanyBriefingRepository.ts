import type {
  CompanyBriefing,
  CompanySource,
} from '#src/domain/companyBriefing/CompanyBriefing.js';

export interface UpsertCompanyBriefingData {
  id: string;
  applicationId: string;
  content: string;
  sources: CompanySource[];
  generatedAt: Date;
}

export interface ICompanyBriefingRepository {
  findByApplicationId(applicationId: string): Promise<CompanyBriefing | null>;
  /**
   * One briefing per application: regenerating replaces the row rather than
   * adding another. The unique constraint on `applicationId` is what makes
   * that true, not the caller remembering to delete first.
   */
  upsert(data: UpsertCompanyBriefingData): Promise<CompanyBriefing>;
}
