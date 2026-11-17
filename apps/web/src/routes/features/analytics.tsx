import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureAnalyticsPage } from '../../features/marketing/pages/FeatureAnalyticsPage';

const TITLE = 'Job Search Analytics & Insights — Trakwyn';
const DESCRIPTION =
  'Response rates, interview conversion, ghosting detection and channel analytics for your job search pipeline.';

export const Route = createFileRoute('/features/analytics')({
  head: () =>
    marketingHead({ path: '/features/analytics', title: TITLE, description: DESCRIPTION }),
  component: FeatureAnalyticsPage,
});
