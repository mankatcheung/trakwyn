import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { PricingPage } from '../features/marketing/pages/PricingPage';

export const Route = createFileRoute('/pricing')({
  head: ({ match }) =>
    marketingHead({ path: '/pricing', seo: 'pricing' }, match.context.pageLocale),
  component: PricingPage,
});
