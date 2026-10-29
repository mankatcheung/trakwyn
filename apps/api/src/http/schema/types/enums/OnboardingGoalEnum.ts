import { builder } from '#src/http/schema/builder.js';
import { ONBOARDING_GOALS } from '#src/use-cases/constants.js';

/** The welcome flow's goals (JEF-460), as `TRACK_APPLICATIONS` etc. over the stored lowercase values. */
export const OnboardingGoalEnum = builder.enumType('OnboardingGoal', {
  values: Object.fromEntries(
    ONBOARDING_GOALS.map((goal) => [goal.toUpperCase(), { value: goal }]),
  ) as Record<
    Uppercase<(typeof ONBOARDING_GOALS)[number]>,
    { value: (typeof ONBOARDING_GOALS)[number] }
  >,
});
