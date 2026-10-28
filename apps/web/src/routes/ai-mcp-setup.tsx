import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { AiMcpSetupPage } from './-components/AiMcpSetupPage';

const TITLE = 'Connect Your Own AI Key and an MCP Client — Trakwyn';
const DESCRIPTION =
  'Step-by-step: bring your own OpenAI, Anthropic, Google AI, or OpenRouter key for AI features, and connect an MCP client like Claude Desktop or Cursor to your Trakwyn data.';

export const Route = createFileRoute('/ai-mcp-setup')({
  head: () => marketingHead({ path: '/ai-mcp-setup', title: TITLE, description: DESCRIPTION }),
  component: AiMcpSetupPage,
});
