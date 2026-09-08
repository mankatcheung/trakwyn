import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { streamChatMessage, ChatStreamError } from '#/lib/chatStream';
import { CHAT_MESSAGE_MAX_CHARS } from '#/constants';
import { Link } from '@tanstack/react-router';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { LLM_PROVIDER_LABEL } from '#/routes/_authenticated/settings/-components/shared';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { Button, Input, Skeleton, Spinner } from '@trakwyn/ui';
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
  /** Provider/model to create the conversation with, if `conversationId` is null. Picking UI lives in the caller. */
  provider: string | null;
  model: string;
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
 * delete/new/history actions, minimize/maximize/close) and the
 * provider/model picker are caller-specific and stay outside this component.
 */
export function ChatConversationView({
  conversationId,
  provider,
  model,
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
    mutationFn: (vars: { provider?: string | null; model?: string | null }) =>
      gqlClient.request<{ createConversation: Conversation }>(CREATE_CONVERSATION, vars),
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

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setInput('');
    setWasCancelled(false);

    let targetConversationId = conversationId;
    if (!targetConversationId) {
      const created = await createConversation.mutateAsync({
        provider,
        model: model.trim() || undefined,
      });
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
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </>
        )}

        {send.isPending &&
          (streamingText ? (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm whitespace-pre-wrap text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {streamingText}
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
                from: LLM_PROVIDER_LABEL[fallbackNotice.from] ?? fallbackNotice.from,
                to: LLM_PROVIDER_LABEL[fallbackNotice.to] ?? fallbackNotice.to,
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
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className={`flex shrink-0 gap-2 border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 ${compact ? 'p-2' : 'py-3'}`}
      >
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.inputPlaceholder')}
          maxLength={CHAT_MESSAGE_MAX_CHARS}
          className="flex-1"
        />
        {send.isPending ? (
          <Button type="button" variant="secondary" onClick={handleCancel}>
            {t('chat.cancel')}
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            {t('chat.send')}
          </Button>
        )}
      </form>
    </div>
  );
}
