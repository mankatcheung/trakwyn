import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import {
  COMPLETE_ONBOARDING,
  ONBOARDING_STATE_KEY,
  type OnboardingState,
} from '#/features/onboarding/graphql/onboardingQueries';
import type { OnboardingGoal } from '#/features/onboarding/lib/onboarding';

/**
 * Saves the goals and marks the flow done. Skipping passes `[]`. The guard's
 * cache entry is written directly so the next navigation is not sent back.
 */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goals: readonly OnboardingGoal[]) =>
      gqlClient.request(COMPLETE_ONBOARDING, { goals: [...goals] }),
    onSuccess: (_result, goals) => {
      qc.setQueryData<OnboardingState>(ONBOARDING_STATE_KEY, {
        onboardingCompletedAt: new Date().toISOString(),
        onboardingGoals: [...goals],
      });
      void qc.invalidateQueries({ queryKey: ['onboardingChecklist'] });
    },
  });
}
