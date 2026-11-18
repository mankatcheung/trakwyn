import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeaturesIndexPage } from '../../features/marketing/pages/FeaturesIndexPage';

export const Route = createFileRoute('/features/')({
  head: ({ match }) =>
    marketingHead({ path: '/features', seo: 'features' }, match.context.pageLocale),
  component: FeaturesIndexPage,
});
