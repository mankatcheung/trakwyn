import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { heroPreloadLinks } from '../../features/marketing/pages/heroPreloads';
import { FeatureAiAssistantPage } from '../../features/marketing/pages/FeatureAiAssistantPage';

export const Route = createFileRoute('/features/ai-assistant')({
  head: ({ match }) =>
    marketingHead(
      { path: '/features/ai-assistant', seo: 'aiAssistant' },
      match.context.pageLocale,
      heroPreloadLinks('assistant'),
    ),
  component: FeatureAiAssistantPage,
});
