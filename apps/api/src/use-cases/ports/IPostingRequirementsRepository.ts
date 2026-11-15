import type { PostingRequirements } from '#src/domain/postingRequirements/PostingRequirements.js';

export interface IPostingRequirementsRepository {
  findByApplicationId(applicationId: string): Promise<PostingRequirements | null>;
  /**
   * One row per application: extracting again replaces it. The unique
   * constraint on `applicationId` is what makes that true, not the caller
   * remembering to delete first.
   */
  upsert(data: PostingRequirements): Promise<PostingRequirements>;
}
