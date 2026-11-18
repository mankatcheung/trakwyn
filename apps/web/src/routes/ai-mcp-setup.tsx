import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { AiMcpSetupPage } from '../features/marketing/pages/AiMcpSetupPage';

export const Route = createFileRoute('/ai-mcp-setup')({
  head: ({ match }) =>
    marketingHead({ path: '/ai-mcp-setup', seo: 'aiMcpSetup' }, match.context.pageLocale),
  component: AiMcpSetupPage,
});
