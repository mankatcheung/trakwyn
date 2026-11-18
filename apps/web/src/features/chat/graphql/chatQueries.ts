import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type {
  ChatHistoryResult,
  ConversationsResult,
  SearchConversationsResult,
} from '#/features/chat/lib/shared';

/** Documents and query options for the assistant's conversations and their proposals. */

export const CONVERSATIONS_QUERY = graphql(`
  query Conversations {
    conversations {
      id
      title
      llmProvider
      llmModel
      createdAt
      updatedAt
    }
  }
`);

/**
 * Bounded variant for the assistant sidebar: the ten most recent threads,
 * not the user's entire history (JEF-229).
 */
export const RECENT_CONVERSATIONS_QUERY = graphql(`
  query RecentConversations($limit: Int!) {
    conversations(limit: $limit) {
      id
      title
      llmProvider
      llmModel
      createdAt
      updatedAt
    }
  }
`);

/** Server-side search over titles and message contents (JEF-229). */
export const SEARCH_CONVERSATIONS_QUERY = graphql(`
  query SearchConversations($query: String!) {
    searchConversations(query: $query) {
      id
      title
      llmProvider
      llmModel
      createdAt
      updatedAt
    }
  }
`);

export const CHAT_HISTORY_QUERY = graphql(`
  query ChatHistory($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) {
      id
      role
      content
      createdAt
      myRating {
        rating
        reason
      }
      proposals {
        id
        toolName
        summary
        status
        error
      }
    }
  }
`);

/** Applies a write the assistant proposed (JEF-469). The server runs the saved arguments, never the client's. */
export const CONFIRM_CHAT_ACTION = graphql(`
  mutation ConfirmChatAction($id: ID!) {
    confirmChatAction(id: $id) {
      id
      toolName
      summary
      status
      error
    }
  }
`);

export const DISMISS_CHAT_ACTION = graphql(`
  mutation DismissChatAction($id: ID!) {
    dismissChatAction(id: $id) {
      id
      toolName
      summary
      status
      error
    }
  }
`);

export const CREATE_CONVERSATION = graphql(`
  mutation CreateConversation($provider: String, $model: String) {
    createConversation(provider: $provider, model: $model) {
      id
      title
      llmProvider
      llmModel
      createdAt
      updatedAt
    }
  }
`);

export const DELETE_CONVERSATION = graphql(`
  mutation DeleteConversation($id: ID!) {
    deleteConversation(id: $id)
  }
`);

export const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'],
  queryFn: async () => (await gqlClient.request(CONVERSATIONS_QUERY)) as ConversationsResult,
});

/** How many conversations the sidebar shows. */
export const SIDEBAR_CONVERSATION_LIMIT = 10;

export function recentConversationsQueryOptions(limit: number = SIDEBAR_CONVERSATION_LIMIT) {
  return queryOptions({
    queryKey: ['conversations', 'recent', limit],
    queryFn: async () =>
      (await gqlClient.request(RECENT_CONVERSATIONS_QUERY, { limit })) as ConversationsResult,
  });
}

export function searchConversationsQueryOptions(query: string) {
  return queryOptions({
    queryKey: ['conversations', 'search', query],
    queryFn: async () =>
      (await gqlClient.request(SEARCH_CONVERSATIONS_QUERY, { query })) as SearchConversationsResult,
  });
}

export function chatHistoryQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ['chatHistory', conversationId],
    queryFn: async () =>
      (await gqlClient.request(CHAT_HISTORY_QUERY, { conversationId })) as ChatHistoryResult,
  });
}
