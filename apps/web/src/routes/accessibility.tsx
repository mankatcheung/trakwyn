import { createFileRoute } from '@tanstack/react-router';
import { legalHead } from '#/lib/seo';
import { AccessibilityPage } from '../features/legal/pages/AccessibilityPage';

export const Route = createFileRoute('/accessibility')({
  head: ({ match }) =>
    legalHead({ path: '/accessibility', seo: 'accessibility' }, match.context.pageLocale),
  component: AccessibilityPage,
});
