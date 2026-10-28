import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { PricingPage } from './-components/PricingPage';

const TITLE = 'Pricing — Trakwyn';
const DESCRIPTION =
  'Trakwyn is free to start. Pro removes the application limit and adds analytics, reminders, offer tools, share links and API access: $12 a month, or a 3-month or 6-month pass.';

export const Route = createFileRoute('/pricing')({
  head: () => marketingHead({ path: '/pricing', title: TITLE, description: DESCRIPTION }),
  component: PricingPage,
});
