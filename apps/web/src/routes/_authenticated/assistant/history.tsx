import { createFileRoute } from '@tanstack/react-router';
import { conversationsQueryOptions } from '#/features/chat/graphql/chatQueries';
import { ConversationHistoryPage } from '../../../features/chat/pages/ConversationHistoryPage';

export const Route = createFileRoute('/_authenticated/assistant/history')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...conversationsQueryOptions, staleTime: 'static' });
  },
  component: ConversationHistoryPage,
});
