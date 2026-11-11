import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { streamChatMessage, ChatStreamError } from '#/lib/chatStream';
import { CHAT_MESSAGE_MAX_CHARS } from '#/constants';
import { Link } from '@tanstack/react-router';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { providerEntryLabel } from '#/routes/_authenticated/settings/-components/aiProviderOrder';
import { getErrorMessage } from '#/lib/errors';
import { QuotaHint } from '#/components/QuotaHint';
import { contentQuotaQueryKey, useQuotaState } from '#/lib/contentQuota';
import { useLocale } from '#/lib/i18n';
import { Button, Skeleton, Spinner } from '@trakwyn/ui';
import { Markdown } from '#/components/Markdown';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { ChatComposerInput } from '#/routes/_authenticated/assistant/-components/ChatComposerInput';
import { ChatProposalCard } from '#/routes/_authenticated/assistant/-components/ChatProposalCard';
import { AiFeedbackControl } from '#/components/AiFeedbackControl';
import type { AiRating } from '#/lib/aiFeedback';
import {
  CREATE_CONVERSATION,
  chatHistoryQueryOptions,
  conversationsQueryOptions,
  type ChatHistoryResult,
  type ChatMessage,
  type Conversation,
  type ConversationsResult,
} from '#/routes/_authenticated/assistant/-shared';

const LOADING_MESSAGE_INTERVAL_MS = 3000;
const LOADING_MESSAGE_COUNT = 4;

function tempMessageId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ChatConversationViewProps {
  /** null means no conversation has been created yet — the first send lazily creates one. */
  conversationId: string | null;
  /** Called once a conversation is lazily created on first send, so the caller can navigate/pin/etc. */
  onConversationCreated: (id: string) => void;
  /** Shown as clickable chips in the empty state, before any messages exist. Omit for a tighter layout. */
  suggestedQuestions?: string[];
  /** Tightens padding/max-width/text-size for the floating dock widget vs. the full page. */
  compact?: boolean;
}

/**
 * The core message-list + composer shared by the full-page assistant and the
 * floating chat dock widget (JEF-133) — history fetching, optimistic send,
 * the "thinking…" loading state, and AI_NOT_CONFIGURED error handling all
 * live here so the two surfaces can't drift apart. Header chrome (title,
 * delete/new/history actions, minimize/maximize/close) and the line saying
 * what answers are caller-specific and stay outside this component.
 */
export function ChatConversationView({
  conversationId,
  onConversationCreated,
  suggestedQuestions,
  compact = false,
}: ChatConversationViewProps) {
  const { t } = useLocale();
  const LOADING_MESSAGES = [
    t('chat.loadingThinking'),
    t('chat.loadingLookingApplications'),
    t('chat.loadingCheckingDetails'),
    t('chat.loadingAlmostThere'),
  ];
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  // The in-progress assistant reply, grown one chunk at a time as the server
  // streams it (JEF-239) — a transient render-only value, not part of
  // react-query's cache. Replaced by the real persisted message once the
  // stream finishes and the history query is refetched.
  const [streamingText, setStreamingText] = useState('');
  /**
   * Set when the key this turn would have used was paused and the user's
   * opt-in fallback picked another (JEF-258). Cleared at the start of each
   * turn, so it describes the reply on screen rather than an earlier one.
   */
  const [fallbackNotice, setFallbackNotice] = useState<{ from: string; to: string } | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: historyData, isLoading: isHistoryLoading } = useQuery({
    ...chatHistoryQueryOptions(conversationId ?? ''),
    enabled: !!conversationId,
  });
  const messages = useMemo(
    () => (conversationId ? (historyData?.chatHistory ?? []) : []),
    [conversationId, historyData],
  );

  const { onTrakwynAi, refresh: refreshAiCredits } = useAiCredits();

  const abortControllerRef = useRef<AbortController | null>(null);

  const send = useMutation({
    mutationFn: (vars: { conversationId: string; message: string }) => {
      setStreamingText('');
      setFallbackNotice(null);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      return streamChatMessage({
        conversationId: vars.conversationId,
        message: vars.message,
        onDelta: (text) => setStreamingText((prev) => prev + text),
        onFallback: setFallbackNotice,
        signal: controller.signal,
      });
    },
  });

  const handleCancel = () => {
    setWasCancelled(true);
    abortControllerRef.current?.abort();
  };

  const createConversation = useMutation({
    // Which AI answers is the user's provider order, not something a chat is created with (JEF-503).
    mutationFn: () => gqlClient.request<{ createConversation: Conversation }>(CREATE_CONVERSATION),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, send.isPending]);

  useEffect(() => {
    if (!send.isPending) {
      setLoadingMessageIndex(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGE_COUNT);
    }, LOADING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [send.isPending]);

  const appendOptimistic = (targetConversationId: string, message: ChatMessage) => {
    qc.setQueryData<ChatHistoryResult>(
      chatHistoryQueryOptions(targetConversationId).queryKey,
      (prev) => ({ chatHistory: [...(prev?.chatHistory ?? []), message] }),
    );
  };

  // Keeps a rating in the cached history, so it is still there when the list re-renders (JEF-547).
  const setMessageRating = (
    targetConversationId: string,
    messageId: string,
    next: AiRating | null,
  ) => {
    qc.setQueryData<ChatHistoryResult>(
      chatHistoryQueryOptions(targetConversationId).queryKey,
      (prev) =>
        prev && {
          chatHistory: prev.chatHistory.map((m) =>
            m.id === messageId ? { ...m, myRating: next } : m,
          ),
        },
    );
  };

  // Starting a conversation is what the cap blocks; writing in one that exists is not.
  const conversationsFull = useQuotaState('conversations')?.level === 'full';
  const newConversationBlocked = !conversationId && conversationsFull;

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending || newConversationBlocked) return;
    setInput('');
    setWasCancelled(false);

    let targetConversationId = conversationId;
    if (!targetConversationId) {
      let created: { createConversation: Conversation };
      try {
        created = await createConversation.mutateAsync();
      } catch {
        // Shown below with the API's message (a cap reached by a race names its
        // limit); the text goes back into the composer so nothing is lost.
        setInput(trimmed);
        void qc.invalidateQueries({ queryKey: contentQuotaQueryKey });
        return;
      }
      void qc.invalidateQueries({ queryKey: contentQuotaQueryKey });
      targetConversationId = created.createConversation.id;
      qc.setQueryData<ConversationsResult>(conversationsQueryOptions.queryKey, (prev) => ({
        conversations: [created.createConversation, ...(prev?.conversations ?? [])],
      }));
      onConversationCreated(targetConversationId);
    }

    appendOptimistic(targetConversationId, {
      id: tempMessageId(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    });
    try {
      await send.mutateAsync({
        conversationId: targetConversationId,
        message: trimmed,
      });
      // The server has already persisted the real assistant message by the
      // time the stream reports done — refetch rather than optimistically
      // appending, so the transient streamingText bubble is replaced by the
      // authoritative version (real id/timestamp) instead of a second,
      // slightly-different copy of the same reply.
      await qc.invalidateQueries({
        queryKey: chatHistoryQueryOptions(targetConversationId).queryKey,
      });
      // Refreshes the conversation's title (auto-derived server-side from
      // the first message) and ordering (most-recently-updated first).
      void qc.invalidateQueries({ queryKey: conversationsQueryOptions.queryKey });
    } catch {
      // Error surfaced below via send.isError — the user's message stays visible so they can retry.
    } finally {
      setStreamingText('');
      // A turn on Trakwyn AI spends a credit, and a failed one may have too,
      // so the meter is re-read whatever the outcome (JEF-511).
      void refreshAiCredits();
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSend(input);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${compact ? 'p-3' : 'mb-4 space-y-4'}`}
      >
        {conversationId && isHistoryLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('chat.emptyPrompt')}</p>
                {suggestedQuestions && suggestedQuestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleSend(q)}
                        className="rounded-full border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 wrap-break-word whitespace-pre-wrap text-white'
                        : 'border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {m.role === 'assistant' ? <Markdown content={m.content} /> : m.content}
                  </div>
                </div>
                {conversationId && m.role === 'assistant' && (
                  <AiFeedbackControl
                    className="pl-1"
                    targetKind="CHAT_MESSAGE"
                    targetId={m.id}
                    rating={m.myRating ?? null}
                    onChange={(next) => setMessageRating(conversationId, m.id, next)}
                  />
                )}
                {conversationId &&
                  m.proposals?.map((p) => (
                    <div key={p.id} className="flex justify-start">
                      <ChatProposalCard proposal={p} conversationId={conversationId} />
                    </div>
                  ))}
              </div>
            ))}
          </>
        )}

        {send.isPending &&
          (streamingText ? (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Markdown content={streamingText} />
              </div>
            </div>
          ) : (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800">
                <Spinner />
                {LOADING_MESSAGES[loadingMessageIndex]}
              </div>
            </div>
          ))}

        {fallbackNotice && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-900/20">
            <p className="text-xs text-amber-700 dark:text-amber-500">
              {t('assistant.fallbackNotice', {
                from: providerEntryLabel(fallbackNotice.from, t),
                to: providerEntryLabel(fallbackNotice.to, t),
              })}{' '}
              <Link to="/settings/ai" className="underline">
                {t('assistant.manageLimits')}
              </Link>
            </p>
          </div>
        )}

        {send.isError && !wasCancelled && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <AiErrorMessage
              code={send.error instanceof ChatStreamError ? send.error.code : undefined}
              fallback={
                send.error instanceof ChatStreamError
                  ? send.error.message
                  : getErrorMessage(send.error)
              }
            />
          </p>
        )}
        {createConversation.isError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {getErrorMessage(createConversation.error)}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {!conversationId && <QuotaHint resource="conversations" className="px-2 pb-1" />}
      <div className="shrink-0 border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
        {onTrakwynAi && (
          <AiCreditsMeter variant="inline" className={compact ? 'px-2 pt-2' : 'pt-2'} />
        )}
        <form onSubmit={onSubmit} className={`flex items-end gap-2 ${compact ? 'p-2' : 'py-3'}`}>
          <ChatComposerInput
            value={input}
            onChange={setInput}
            onSubmit={() => void handleSend(input)}
            placeholder={t('chat.inputPlaceholder')}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
          />
          {send.isPending ? (
            <Button type="button" variant="secondary" onClick={handleCancel}>
              {t('chat.cancel')}
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || newConversationBlocked}>
              {t('chat.send')}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
