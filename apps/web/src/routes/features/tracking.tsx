import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureTrackingPage } from '../../features/marketing/pages/FeatureTrackingPage';

export const Route = createFileRoute('/features/tracking')({
  head: ({ match }) =>
    marketingHead({ path: '/features/tracking', seo: 'tracking' }, match.context.pageLocale),
  component: FeatureTrackingPage,
});
