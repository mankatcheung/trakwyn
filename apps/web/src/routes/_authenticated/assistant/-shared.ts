import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { showUndoToast } from '#/lib/undoToast';
import { toast } from 'sonner';

// ── GraphQL queries & mutations ────────────────────────────────────────────

export const CONVERSATIONS_QUERY = `
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
`;

/**
 * Bounded variant for the assistant sidebar: the ten most recent threads,
 * not the user's entire history (JEF-229).
 */
export const RECENT_CONVERSATIONS_QUERY = `
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
`;

/** Server-side search over titles and message contents (JEF-229). */
export const SEARCH_CONVERSATIONS_QUERY = `
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
`;

export const CHAT_HISTORY_QUERY = `
  query ChatHistory($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) {
      id
      role
      content
      createdAt
      proposals {
        id
        toolName
        summary
        status
        error
      }
    }
  }
`;

/** Applies a write the assistant proposed (JEF-469). The server runs the saved arguments, never the client's. */
export const CONFIRM_CHAT_ACTION = `
  mutation ConfirmChatAction($id: ID!) {
    confirmChatAction(id: $id) {
      id
      toolName
      summary
      status
      error
    }
  }
`;

export const DISMISS_CHAT_ACTION = `
  mutation DismissChatAction($id: ID!) {
    dismissChatAction(id: $id) {
      id
      toolName
      summary
      status
      error
    }
  }
`;

export const CREATE_CONVERSATION = `
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
`;

export const DELETE_CONVERSATION = `
  mutation DeleteConversation($id: ID!) {
    deleteConversation(id: $id)
  }
`;

// ── Types ───────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export type ChatProposalStatus = 'pending' | 'confirmed' | 'dismissed' | 'expired' | 'failed';

/** A write the assistant proposed, at its current status (JEF-469). */
export interface ChatProposal {
  id: string;
  toolName: string;
  summary: string;
  status: ChatProposalStatus;
  error: string | null;
}

export interface ChatMessage {
  // Server-persisted messages carry their real id/createdAt; optimistic
  // messages appended client-side before the round-trip completes get a
  // locally-generated id/timestamp instead — both give the message list a
  // stable React key without waiting on the network.
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Absent on optimistic messages, which have no reply to propose anything yet. */
  proposals?: ChatProposal[];
}

export interface ChatHistoryResult {
  chatHistory: ChatMessage[];
}

export interface Conversation {
  id: string;
  title: string | null;
  llmProvider: string | null;
  llmModel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsResult {
  conversations: Conversation[];
}

// ── Query options ───────────────────────────────────────────────────────────

export const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'],
  queryFn: () => gqlClient.request<ConversationsResult>(CONVERSATIONS_QUERY),
});

/** How many conversations the sidebar shows. */
export const SIDEBAR_CONVERSATION_LIMIT = 10;

export function recentConversationsQueryOptions(limit: number = SIDEBAR_CONVERSATION_LIMIT) {
  return queryOptions({
    queryKey: ['conversations', 'recent', limit],
    queryFn: () => gqlClient.request<ConversationsResult>(RECENT_CONVERSATIONS_QUERY, { limit }),
  });
}

export interface SearchConversationsResult {
  searchConversations: Conversation[];
}

export function searchConversationsQueryOptions(query: string) {
  return queryOptions({
    queryKey: ['conversations', 'search', query],
    queryFn: () =>
      gqlClient.request<SearchConversationsResult>(SEARCH_CONVERSATIONS_QUERY, { query }),
  });
}

export function chatHistoryQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ['chatHistory', conversationId],
    queryFn: () => gqlClient.request<ChatHistoryResult>(CHAT_HISTORY_QUERY, { conversationId }),
  });
}

// ── Shared delete-with-undo handler ─────────────────────────────────────────

/**
 * Optimistically removes a conversation from the cached list and shows an
 * undo toast; the actual deletion (and dropping its chat-history cache
 * entry) only fires once the toast's undo window expires. Shared between
 * the chat page and the history page so both stay in sync.
 *
 * A conversation cannot be restored once deleted, so this keeps the deferred
 * form rather than JEF-190's send-immediately one. The request is recorded
 * durably, so leaving the page mid-window postpones it rather than losing it.
 */
export function deleteConversationWithUndo(
  qc: QueryClient,
  id: string,
  onDeleted?: () => void,
): void {
  const snapshot = qc.getQueryData<ConversationsResult>(conversationsQueryOptions.queryKey);
  qc.setQueryData<ConversationsResult>(conversationsQueryOptions.queryKey, (prev) => ({
    conversations: (prev?.conversations ?? []).filter((c) => c.id !== id),
  }));
  onDeleted?.();
  showUndoToast({
    message: 'Conversation deleted',
    operation: { document: DELETE_CONVERSATION, variables: { id } },
    onUndo: () => {
      qc.setQueryData<ConversationsResult>(conversationsQueryOptions.queryKey, snapshot);
      toast.dismiss();
    },
    // Runs whether or not the request succeeded: dropping the chat-history
    // entry is right either way, and the list refetch corrects it if the
    // delete failed (showUndoToast has already surfaced the error).
    onSettled: () => {
      qc.removeQueries({ queryKey: chatHistoryQueryOptions(id).queryKey });
      qc.invalidateQueries({ queryKey: conversationsQueryOptions.queryKey });
    },
  });
}

export function timeAgo(
  iso: string,
  t: (key: string, options?: Record<string, number>) => string,
): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('notificationInbox.justNow');
  if (minutes < 60) return t('notificationInbox.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notificationInbox.hoursAgo', { count: hours });
  return t('notificationInbox.daysAgo', { count: Math.floor(hours / 24) });
}
