import { createFileRoute } from '@tanstack/react-router';
import { conversationsQueryOptions } from '#/routes/_authenticated/assistant/-shared';
import { ConversationHistoryPage } from './-components/ConversationHistoryPage';

export const Route = createFileRoute('/_authenticated/assistant/history')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...conversationsQueryOptions, staleTime: 'static' });
  },
  component: ConversationHistoryPage,
});
