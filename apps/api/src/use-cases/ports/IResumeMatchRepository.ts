import type { ResumeMatch } from '#src/domain/resumeMatch/ResumeMatch.js';

export interface IResumeMatchRepository {
  findByApplicationId(applicationId: string): Promise<ResumeMatch[]>;
  /**
   * One match per resume: regenerating replaces the row rather than adding
   * another. The unique constraints on `documentDraftId` and `documentId` are
   * what make that true, not the caller remembering to delete first.
   */
  upsert(data: ResumeMatch): Promise<ResumeMatch>;
}
