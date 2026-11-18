import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureAiAssistantPage } from '../../features/marketing/pages/FeatureAiAssistantPage';

export const Route = createFileRoute('/features/ai-assistant')({
  head: ({ match }) =>
    marketingHead({ path: '/features/ai-assistant', seo: 'aiAssistant' }, match.context.pageLocale),
  component: FeatureAiAssistantPage,
});
