export interface IDismissOnboardingChecklistUseCase {
  execute(userId: string): Promise<void>;
}
