import { graphql } from '#/graphql/generated';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import type { OnboardingGoal } from '#/features/onboarding/lib/onboarding';

/** What the first-run welcome flow (JEF-460) reads and writes: the documents, the guard's cache entry and its checks. */

export const ONBOARDING_STATE_QUERY = graphql(`
  query OnboardingState {
    me {
      onboardingCompletedAt
      onboardingGoals
    }
  }
`);

export const COMPLETE_ONBOARDING = graphql(`
  mutation CompleteOnboarding($goals: [OnboardingGoal!]!) {
    completeOnboarding(goals: $goals)
  }
`);

/** Query key shared by the route guard and the welcome page, so finishing updates the guard. */
export const ONBOARDING_STATE_KEY = ['me', 'onboarding'] as const;

export interface OnboardingState {
  onboardingCompletedAt: string | null;
  onboardingGoals: OnboardingGoal[];
}

async function fetchOnboardingState(): Promise<OnboardingState | null> {
  const data = (await gqlClient.request(ONBOARDING_STATE_QUERY)) as { me: OnboardingState | null };
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
    return await queryClient.query(onboardingStateQueryOptions);
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
