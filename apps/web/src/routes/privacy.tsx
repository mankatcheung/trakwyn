import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '#/lib/seo';
import { PrivacyPage } from '../features/legal/pages/PrivacyPage';

export const Route = createFileRoute('/privacy')({
  head: ({ match }) => legalHead({ path: '/privacy', seo: 'privacy' }, match.context.pageLocale),
  component: PrivacyPage,
});
