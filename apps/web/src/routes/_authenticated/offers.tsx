import { createFileRoute } from '@tanstack/react-router';
import { lazyRouteComponent } from '@tanstack/react-router';
import { myOffersQueryOptions } from './-offers-queries';

export const Route = createFileRoute('/_authenticated/offers')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(myOffersQueryOptions),
  component: lazyRouteComponent(() => import('./-offers-page'), 'OffersPage'),
});
