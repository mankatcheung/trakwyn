/**
 * The first-run welcome flow (JEF-460). A user who has never finished or
 * skipped it is sent to `/welcome` by the authenticated shell; the goals they
 * pick there decide which of its steps they see and which dashboard checklist
 * items stay relevant.
 */

/** The API's `OnboardingGoal` enum, in display order. */
export const ONBOARDING_GOALS = ['TRACK_APPLICATIONS', 'AI_DOCUMENTS', 'ASSISTANT', 'MCP'] as const;
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];

/** Goals whose output is written from the user's profile with their own AI key. */
const AI_GOALS: readonly OnboardingGoal[] = ['AI_DOCUMENTS', 'ASSISTANT'];

export function hasAiGoal(goals: readonly OnboardingGoal[]): boolean {
  return goals.some((goal) => AI_GOALS.includes(goal));
}

export type WelcomeStep = 'intro' | 'goals' | 'profile' | 'aiKey' | 'finish';

/** The steps shown for the goals picked so far. The profile and key steps are for AI goals only. */
export function welcomeSteps(goals: readonly OnboardingGoal[]): WelcomeStep[] {
  return hasAiGoal(goals)
    ? ['intro', 'goals', 'profile', 'aiKey', 'finish']
    : ['intro', 'goals', 'finish'];
}

/** Where finishing lands: straight to a new application if tracking is all they came for. */
export function finishDestination(
  goals: readonly OnboardingGoal[],
): '/applications/new' | '/dashboard' {
  return goals.length === 1 && goals[0] === 'TRACK_APPLICATIONS'
    ? '/applications/new'
    : '/dashboard';
}
