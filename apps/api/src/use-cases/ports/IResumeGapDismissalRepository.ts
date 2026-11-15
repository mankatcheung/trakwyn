/**
 * The gap questions a user has answered "no" to for an application (JEF-594),
 * so the same question is not asked again on every visit. A key is either a
 * requirement as it was shown, or `role:<workExperienceId>`; see `resumeGapKeys.ts`.
 */
export interface IResumeGapDismissalRepository {
  findKeysByApplicationId(applicationId: string): Promise<string[]>;
  /** Idempotent: dismissing the same gap twice keeps one row. */
  add(data: { id: string; applicationId: string; key: string }): Promise<void>;
  countByApplicationId(applicationId: string): Promise<number>;
}
