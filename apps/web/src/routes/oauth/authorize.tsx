import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { McpAuthorizePage } from '../../features/auth/pages/McpAuthorizePage';

const searchSchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  response_type: z.literal('code'),
  scope: z.enum(['read', 'full']),
  code_challenge: z.string(),
  code_challenge_method: z.literal('S256'),
  state: z.string().optional(),
});

export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: searchSchema,
  ssr: false,
  component: McpAuthorizePage,
});
