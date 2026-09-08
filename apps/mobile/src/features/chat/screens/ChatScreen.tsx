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
import type { ChatMessage } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { CHAT_MESSAGE_MAX_CHARS } from '../../../constants';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

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

  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoSentInitialMessage = useRef(false);

  const messages = history ?? [];

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, streamingText]);

  const sendMessage = async (trimmed: string) => {
    if (!trimmed || isSending) return;
    setSendError(null);
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
      });

      await queryClient.invalidateQueries({ queryKey: chatHistoryQueryKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    } catch (err) {
      setSendError(err instanceof ChatStreamError ? err.message : getErrorMessage(err));
    } finally {
      setIsSending(false);
      setStreamingText('');
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
            <View style={[styles.bubbleRow, item.role === 'user' && styles.bubbleRowUser]}>
              <View
                style={[
                  styles.bubble,
                  item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                <Text
                  style={item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}
                >
                  {item.content}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      {isSending ? (
        <View style={[styles.bubbleRow, { paddingHorizontal: 16 }]}>
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            {streamingText ? (
              <Text style={styles.bubbleTextAssistant}>{streamingText}</Text>
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

      {sendError ? <Text style={styles.error}>{sendError}</Text> : null}

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
        >
          <Text style={styles.sendButtonText}>{t('send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loading: { marginTop: 40 },
    list: { padding: 16, gap: 8 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    bubbleRow: { flexDirection: 'row', marginBottom: 8 },
    bubbleRowUser: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleUser: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
    bubbleAssistant: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleTextUser: { color: colors.surface, fontSize: 14 },
    bubbleTextAssistant: { color: colors.text, fontSize: 14 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      marginHorizontal: 16,
      fontSize: 13,
    },
    composer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.surface,
    },
    sendButton: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.5 },
    sendButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  });
}
