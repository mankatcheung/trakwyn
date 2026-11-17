import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  recentConversationsQueryOptions,
  chatHistoryQueryOptions,
} from '#/features/chat/lib/shared';
import { AssistantPage } from '../../../features/chat/pages/AssistantPage';

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
