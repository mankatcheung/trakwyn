import type { QueryClient } from '@tanstack/react-query';
import { showUndoToast } from '#/lib/undoToast';
import { contentQuotaQueryKey } from '#/features/quota/lib/contentQuota';
import type { AiRating } from '#/features/ai/lib/aiFeedback';
import { toast } from 'sonner';
import {
  chatHistoryQueryOptions,
  conversationsQueryOptions,
  DELETE_CONVERSATION,
} from '#/features/chat/graphql/chatQueries';

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
  /** The caller's own thumbs up/down on an assistant reply (JEF-547); null when unrated. */
  myRating?: AiRating | null;
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

export interface SearchConversationsResult {
  searchConversations: Conversation[];
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
      // The conversation cap is counted by the API, so a delete frees a slot (JEF-494).
      qc.invalidateQueries({ queryKey: contentQuotaQueryKey });
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
