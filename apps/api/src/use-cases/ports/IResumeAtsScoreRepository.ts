import type { SavedAtsScore } from '#src/domain/resume/AtsScore.js';

export interface IResumeAtsScoreRepository {
  findByApplicationId(applicationId: string): Promise<SavedAtsScore[]>;
  /**
   * One result per resume: checking again replaces the row rather than adding
   * another. The unique constraints on `documentDraftId` and `documentId` are
   * what make that true, not the caller remembering to delete first.
   */
  upsert(data: SavedAtsScore): Promise<SavedAtsScore>;
}
