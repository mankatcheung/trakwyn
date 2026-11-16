import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  recentConversationsQueryOptions,
  chatHistoryQueryOptions,
} from '#/routes/_authenticated/assistant/-shared';
import { AssistantPage } from './-components/AssistantPage';

const searchSchema = z.object({ conversation: z.string().optional() });

export const Route = createFileRoute('/_authenticated/assistant/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ conversation: search.conversation }),
  loader: async ({ context: { queryClient }, deps }) => {
    // The bounded list for the sidebar, not the full history — the rail
    // only ever renders ten threads (JEF-229).
    await queryClient.query({ ...recentConversationsQueryOptions(), staleTime: 'static' });
    if (deps.conversation) {
      await queryClient.query({
        ...chatHistoryQueryOptions(deps.conversation),
        staleTime: 'static',
      });
    }
  },
  component: AssistantPage,
});
