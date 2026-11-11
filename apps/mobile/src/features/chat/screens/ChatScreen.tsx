import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useChatHistory,
  chatHistoryQueryKey,
  useAppendOptimisticMessage,
} from '../hooks/useChatHistory';
import { conversationsQueryKey } from '../hooks/useConversations';
import { ChatStreamError, streamChatMessage } from '../lib/chatStream';
import { SendIcon } from '../components/SendIcon';
import { providerEntryLabel } from '../../settings/lib/aiProviderOrder';
import { ChatProposalCard } from '../components/ChatProposalCard';
import { AiFeedbackControl } from '../components/AiFeedbackControl';
import { Markdown } from '../../../components/Markdown';
import type { ChatMessage } from '../types';
import { codedErrorMessage, getErrorCode, getErrorMessage } from '../../../lib/errors';
import {
  ERROR_CODES,
  PLAN_REQUIRED,
  CHAT_INPUT_MAX_LINES,
  CHAT_MESSAGE_MAX_CHARS,
} from '../../../constants';
import { AiCreditsInline } from '../../ai/components/AiCreditsInline';
import { useRefreshAiCredits } from '../../ai/hooks/useRefreshAiCredits';
import { AiCreditsExhaustedNotice } from '../../settings/components/AiCreditsExhaustedNotice';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const INPUT_LINE_HEIGHT = 20;
const INPUT_VERTICAL_PADDING = 11;

function tempMessageId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatScreen() {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: conversationId, initialMessage } = useLocalSearchParams<{
    id: string;
    initialMessage?: string;
  }>();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useChatHistory(conversationId);
  const appendOptimistic = useAppendOptimisticMessage();
  const refreshAiCredits = useRefreshAiCredits();

  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendErrorCode, setSendErrorCode] = useState<string | null>(null);
  // The provider that would have answered could not, and the next one in the user's order did (JEF-503).
  const [fallbackNotice, setFallbackNotice] = useState<{ from: string; to: string } | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoSentInitialMessage = useRef(false);

  const messages = history ?? [];

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, streamingText]);

  const sendMessage = async (trimmed: string) => {
    if (!trimmed || isSending) return;
    setSendError(null);
    setSendErrorCode(null);
    setFallbackNotice(null);
    setIsSending(true);
    setStreamingText('');

    try {
      appendOptimistic(conversationId, {
        id: tempMessageId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      });

      await streamChatMessage({
        conversationId,
        message: trimmed,
        onDelta: (text) => setStreamingText((prev) => prev + text),
        onFallback: setFallbackNotice,
      });

      await queryClient.invalidateQueries({ queryKey: chatHistoryQueryKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    } catch (err) {
      setSendError(err instanceof ChatStreamError ? err.message : getErrorMessage(err));
      setSendErrorCode(err instanceof ChatStreamError ? err.code : getErrorCode(err));
    } finally {
      setIsSending(false);
      setStreamingText('');
      // A turn on Trakwyn AI spends a credit, and a failed one may have too (JEF-511).
      void refreshAiCredits();
    }
  };

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => {
    if (!initialMessage || autoSentInitialMessage.current) return;
    autoSentInitialMessage.current = true;
    void sendMessageRef.current(initialMessage);
  }, [initialMessage]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    void sendMessage(trimmed);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {isLoading ? (
        <ActivityIndicator
          style={styles.loading}
          size="large"
          color={colors.primary}
          testID="chat-loading"
        />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyPrompt')}</Text>}
          renderItem={({ item }) => (
            <View>
              <View style={[styles.bubbleRow, item.role === 'user' && styles.bubbleRowUser]}>
                <View
                  style={[
                    styles.bubble,
                    item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  {item.role === 'assistant' ? (
                    <Markdown content={item.content} />
                  ) : (
                    <Text style={styles.bubbleTextUser}>{item.content}</Text>
                  )}
                </View>
              </View>
              {item.role === 'assistant' && !item.id.startsWith('optimistic-') ? (
                <AiFeedbackControl
                  messageId={item.id}
                  conversationId={conversationId}
                  rating={item.myRating ?? null}
                />
              ) : null}
              {item.proposals?.map((proposal) => (
                <ChatProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  conversationId={conversationId}
                />
              ))}
            </View>
          )}
        />
      )}

      {isSending ? (
        <View style={[styles.bubbleRow, styles.sendingRow]}>
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            {streamingText ? (
              <Markdown content={streamingText} />
            ) : (
              <ActivityIndicator
                size="small"
                color={colors.textSubtle}
                testID="chat-sending-indicator"
              />
            )}
          </View>
        </View>
      ) : null}

      {sendError ? (
        sendErrorCode === ERROR_CODES.AI_CREDITS_EXHAUSTED || sendErrorCode === PLAN_REQUIRED ? (
          <AiCreditsExhaustedNotice
            surface="assistant"
            message={sendError}
            reason={sendErrorCode === PLAN_REQUIRED ? 'plan' : 'credits'}
          />
        ) : sendErrorCode === ERROR_CODES.EMAIL_NOT_VERIFIED ||
          sendErrorCode === ERROR_CODES.AI_TEMPORARILY_UNAVAILABLE ? (
          <Text style={styles.error}>{codedErrorMessage(sendErrorCode) ?? sendError}</Text>
        ) : (
          <Text style={styles.error}>{sendError}</Text>
        )
      ) : null}

      {fallbackNotice ? (
        <Text style={styles.notice} testID="chat-fallback-notice">
          {t('fallbackNotice', {
            from: providerEntryLabel(fallbackNotice.from),
            to: providerEntryLabel(fallbackNotice.to),
          })}
        </Text>
      ) : null}

      <View style={styles.composerWrap}>
        <AiCreditsInline testID="chat-credits" style={styles.credits} />
        <View style={styles.composer}>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('inputPlaceholder')}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            testID="chat-input"
          />
          <Pressable
            style={[styles.sendButton, (isSending || !input.trim()) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={isSending || !input.trim()}
            testID="chat-send-button"
            accessibilityLabel={t('send')}
          >
            <SendIcon color={colors.onPrimary} size={18} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loading: { marginTop: 40 },
    list: { padding: 16, gap: 12 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    bubbleRow: { flexDirection: 'row', marginBottom: 12 },
    bubbleRowUser: { justifyContent: 'flex-end' },
    sendingRow: { paddingHorizontal: 16 },
    bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
    bubbleUser: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
    bubbleAssistant: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleTextUser: { color: colors.onPrimary, fontSize: 15, lineHeight: 20 },
    notice: { fontSize: 12, color: colors.textSubtle, paddingHorizontal: 16, paddingBottom: 6 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      marginHorizontal: 16,
      fontSize: 13,
    },
    composerWrap: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    credits: { paddingHorizontal: 16, paddingTop: 8 },
    composer: {
      flexDirection: 'row',
      gap: 10,
      padding: 12,
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: INPUT_LINE_HEIGHT * CHAT_INPUT_MAX_LINES + INPUT_VERTICAL_PADDING * 2,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: INPUT_VERTICAL_PADDING,
      fontSize: 15,
      lineHeight: INPUT_LINE_HEIGHT,
      backgroundColor: colors.surfaceAlt,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.5 },
  });
}
