import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { heroPreloadLinks } from '../../features/marketing/pages/heroPreloads';
import { FeatureAnalyticsPage } from '../../features/marketing/pages/FeatureAnalyticsPage';

export const Route = createFileRoute('/features/analytics')({
  head: ({ match }) =>
    marketingHead(
      { path: '/features/analytics', seo: 'analytics' },
      match.context.pageLocale,
      heroPreloadLinks('analytics'),
    ),
  component: FeatureAnalyticsPage,
});
