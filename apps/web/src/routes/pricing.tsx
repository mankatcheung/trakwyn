import { createFileRoute } from '@tanstack/react-router';
import { PricingPage } from './-components/PricingPage';

const SITE_URL = 'https://www.trakwyn.com';
const TITLE = 'Pricing — Trakwyn';
const DESCRIPTION =
  'Trakwyn is free to start. Pro removes the application limit and adds analytics, reminders, offer tools, share links and API access: $12 a month, or a 3-month or 6-month pass.';

export const Route = createFileRoute('/pricing')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE_URL}/pricing` },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/pricing` }],
  }),
  component: PricingPage,
});
