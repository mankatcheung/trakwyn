import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
} from '../hooks/useConversations';
import { TrashIcon } from '../components/TrashIcon';
import { ConversationProviderPicker } from '../components/ConversationProviderPicker';
import type { Conversation } from '../types';
import { useLlmApiKeys } from '../../settings/hooks/useLlmApiKeys';
import type { LlmApiKey } from '../../settings/types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { FloatingActionButton } from '../../../components/FloatingActionButton';

export function ConversationsScreen() {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { data: conversations, isLoading, isError, error } = useConversations();
  const deleteConversation = useDeleteConversation();
  const createConversation = useCreateConversation();
  const { data: llmApiKeys } = useLlmApiKeys();

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const onNewConversation = async (key?: LlmApiKey) => {
    if (isStarting) return;
    setPickerOpen(false);
    setStartError(null);
    setIsStarting(true);
    try {
      const created = await createConversation.mutateAsync({
        provider: key?.provider ?? null,
        model: key?.model ?? null,
      });
      router.push(`./${created.id}`);
    } catch (err) {
      setStartError(getErrorMessage(err));
    } finally {
      setIsStarting(false);
    }
  };

  const onFabPress = () => {
    if (isStarting) return;
    if (!llmApiKeys || llmApiKeys.keys.length === 0) {
      Alert.alert(t('conversations.noKeysTitle'), t('conversations.noKeysMessage'), [
        { text: t('conversations.cancel'), style: 'cancel' },
        {
          text: t('conversations.noKeysGoToSettings'),
          onPress: () => router.push('/settings/ai'),
        },
      ]);
      return;
    }
    setPickerOpen(true);
  };

  const onDelete = (conversation: Conversation) => {
    Alert.alert(t('conversations.deleteTitle'), t('conversations.deleteMessage'), [
      { text: t('conversations.cancel'), style: 'cancel' },
      {
        text: t('conversations.delete'),
        style: 'destructive',
        onPress: () =>
          deleteConversation.mutate(conversation.id, {
            onError: (err) =>
              Alert.alert(t('conversations.couldNotDeleteTitle'), getErrorMessage(err)),
          }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="conversations-loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {startError ? <Text style={styles.error}>{startError}</Text> : null}

      <FlatList
        data={conversations ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('conversations.empty')}</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`./${item.id}`)}
            testID={`conversation-${item.id}`}
          >
            <View style={styles.textColumn}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title ?? t('conversations.newConversation')}
              </Text>
              <Text style={styles.meta}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
            </View>
            <Pressable
              onPress={() => onDelete(item)}
              hitSlop={8}
              accessibilityLabel={t('conversations.delete')}
              testID={`delete-conversation-${item.id}`}
            >
              <TrashIcon color={colors.danger} />
            </Pressable>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <FloatingActionButton
        onPress={onFabPress}
        accessibilityLabel={t('conversations.newButtonLabel')}
        testID="new-conversation-button"
      />

      {pickerOpen && (
        <ConversationProviderPicker
          keys={llmApiKeys?.keys ?? []}
          defaultProvider={llmApiKeys?.defaultProvider ?? null}
          onSelect={(key) => void onNewConversation(key)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    list: { padding: 16, paddingBottom: 96 },
    separator: { height: 10 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    textColumn: { flex: 1, gap: 2 },
    title: { fontSize: 14, fontWeight: '600', color: colors.text },
    meta: { fontSize: 12, color: colors.textSubtle },
  });
}
