import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureAiAssistantPage } from './-components/FeatureAiAssistantPage';

const TITLE = 'AI Job Search Assistant — Trakwyn';
const DESCRIPTION =
  'An AI assistant that knows your applications, notes and interviews — bring your own OpenAI, Anthropic, or compatible key.';

export const Route = createFileRoute('/features/ai-assistant')({
  head: () =>
    marketingHead({ path: '/features/ai-assistant', title: TITLE, description: DESCRIPTION }),
  component: FeatureAiAssistantPage,
});
