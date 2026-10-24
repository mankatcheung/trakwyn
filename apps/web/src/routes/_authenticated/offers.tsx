import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@tanstack/react-router';
import { getGqlErrorCode, PLAN_REQUIRED_CODE } from '#/lib/graphqlError';
import { myOffersQueryOptions } from './-offers-queries';

export const Route = createFileRoute('/_authenticated/offers')({
  loader: async ({ context: { queryClient } }) => {
    try {
      await queryClient.ensureQueryData(myOffersQueryOptions);
    } catch (error) {
      // Offers are a Pro feature (JEF-344). A loader error replaces the whole
      // app, sidebar included, with the crash screen; the page already renders
      // the upgrade prompt for this one, inside the app, so let it.
      if (getGqlErrorCode(error) !== PLAN_REQUIRED_CODE) throw error;
    }
  },
  component: lazyRouteComponent(() => import('./-offers-page'), 'OffersPage'),
});
