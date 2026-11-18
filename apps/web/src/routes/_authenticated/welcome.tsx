import { createFileRoute, redirect } from '@tanstack/react-router';
import { checkOnboarding } from '#/features/onboarding/graphql/onboardingQueries';
import { WelcomePage } from '../../features/onboarding/pages/WelcomePage';

export const Route = createFileRoute('/_authenticated/welcome')({
  // Shown once (JEF-460): someone who has finished or skipped it, arriving by
  // a bookmark or the back button, goes to the dashboard instead.
  beforeLoad: async () => {
    const state = await checkOnboarding();
    if (state?.onboardingCompletedAt) throw redirect({ to: '/dashboard' });
  },
  component: WelcomePage,
});
