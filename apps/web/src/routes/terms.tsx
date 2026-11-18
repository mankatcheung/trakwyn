import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '#/lib/seo';
import { TermsPage } from '../features/legal/pages/TermsPage';

export const Route = createFileRoute('/terms')({
  head: ({ match }) => legalHead({ path: '/terms', seo: 'terms' }, match.context.pageLocale),
  component: TermsPage,
});
