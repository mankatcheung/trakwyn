import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';

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

export const ONBOARDING_STATE_QUERY = `query OnboardingState { me { onboardingCompletedAt onboardingGoals } }`;

export const COMPLETE_ONBOARDING = `
  mutation CompleteOnboarding($goals: [OnboardingGoal!]!) {
    completeOnboarding(goals: $goals)
  }
`;

/** Query key shared by the route guard and the welcome page, so finishing updates the guard. */
export const ONBOARDING_STATE_KEY = ['me', 'onboarding'] as const;

export interface OnboardingState {
  onboardingCompletedAt: string | null;
  onboardingGoals: OnboardingGoal[];
}

async function fetchOnboardingState(): Promise<OnboardingState | null> {
  const data = await gqlClient.request<{ me: OnboardingState | null }>(ONBOARDING_STATE_QUERY);
  return data.me;
}

const onboardingStateQueryOptions = {
  queryKey: ONBOARDING_STATE_KEY,
  queryFn: fetchOnboardingState,
  // Finished is permanent, so the guard costs one request per session after
  // that; finishing writes the answer into the cache, so it is never stale.
  staleTime: (query: { state: { data: OnboardingState | null | undefined } }) =>
    query.state.data?.onboardingCompletedAt ? Infinity : 10_000,
};

/**
 * For the route guard. A failed check is `null`, which the guard treats as
 * "let them in": the welcome flow is an offer, never a wall.
 */
export async function checkOnboarding(): Promise<OnboardingState | null> {
  try {
    return await queryClient.fetchQuery(onboardingStateQueryOptions);
  } catch {
    return null;
  }
}

/**
 * Paths the welcome redirect leaves alone: the flow itself, and the pages it
 * links out to (the full profile and settings), which would otherwise bounce
 * straight back.
 */
const WELCOME_EXEMPT_PREFIXES = ['/welcome', '/profile', '/settings', '/oauth'];

/** Whether the guard should send this visitor to `/welcome` before `pathname` loads. */
export function needsWelcome(state: OnboardingState | null, pathname: string): boolean {
  if (!state || state.onboardingCompletedAt) return false;
  return !WELCOME_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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

/**
 * Saves the goals and marks the flow done. Skipping passes `[]`. The guard's
 * cache entry is written directly so the next navigation is not sent back.
 */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goals: readonly OnboardingGoal[]) =>
      gqlClient.request(COMPLETE_ONBOARDING, { goals }),
    onSuccess: (_result, goals) => {
      qc.setQueryData<OnboardingState>(ONBOARDING_STATE_KEY, {
        onboardingCompletedAt: new Date().toISOString(),
        onboardingGoals: [...goals],
      });
      void qc.invalidateQueries({ queryKey: ['onboardingChecklist'] });
    },
  });
}
