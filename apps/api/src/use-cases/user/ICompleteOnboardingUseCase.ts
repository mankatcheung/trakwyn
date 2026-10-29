export interface ICompleteOnboardingUseCase {
  /** Saves the goals picked in the welcome flow and marks it done. Skipping passes `[]`. */
  execute(userId: string, goals: readonly string[]): Promise<void>;
}
