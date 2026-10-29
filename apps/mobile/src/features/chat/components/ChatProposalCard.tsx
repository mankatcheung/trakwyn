import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { gqlRequest } from '../../../graphql/client';
import { ANALYTICS_EVENTS, captureEvent } from '../../../lib/analytics';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { CONFIRM_CHAT_ACTION_MUTATION, DISMISS_CHAT_ACTION_MUTATION } from '../graphql/operations';
import { chatHistoryQueryKey } from '../hooks/useChatHistory';
import type { ChatProposal } from '../types';

interface ChatProposalCardProps {
  proposal: ChatProposal;
  conversationId: string;
}

/**
 * A write the assistant proposed (JEF-469): nothing has changed until Confirm.
 * Pending cards carry the buttons; resolved ones (also when the conversation is
 * reopened) show how it ended. Confirm sends only the id; the server applies
 * the arguments it saved.
 */
export function ChatProposalCard({ proposal, conversationId }: ChatProposalCardProps) {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const refreshHistory = () =>
    queryClient.invalidateQueries({ queryKey: chatHistoryQueryKey(conversationId) });

  const confirm = useMutation({
    mutationFn: () => gqlRequest(CONFIRM_CHAT_ACTION_MUTATION, { id: proposal.id }),
    onSuccess: async () => {
      captureEvent(ANALYTICS_EVENTS.ASSISTANT_CHANGE_CONFIRMED, { tool: proposal.toolName });
      // The write could touch any list in the app, so every cached query is
      // marked stale and the ones on screen refetch.
      await queryClient.invalidateQueries();
    },
    // A refusal (PLAN_REQUIRED, expired) is recorded on the proposal, so the
    // refetched card shows it instead of a live button.
    onError: () => void refreshHistory(),
  });
  const dismiss = useMutation({
    mutationFn: () => gqlRequest(DISMISS_CHAT_ACTION_MUTATION, { id: proposal.id }),
    onSuccess: async () => {
      captureEvent(ANALYTICS_EVENTS.ASSISTANT_CHANGE_DISMISSED, { tool: proposal.toolName });
      await refreshHistory();
    },
    onError: () => void refreshHistory(),
  });

  const busy = confirm.isPending || dismiss.isPending;
  const error = confirm.error ?? dismiss.error;
  const isProblem = proposal.status === 'failed' || proposal.status === 'expired';

  return (
    <View style={styles.card} testID={`chat-proposal-${proposal.id}`}>
      <Text style={styles.heading}>{t('proposal.heading')}</Text>
      <Text style={styles.summary}>{proposal.summary}</Text>

      {proposal.status === 'pending' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.confirm, busy && styles.disabled]}
            disabled={busy}
            onPress={() => confirm.mutate()}
            accessibilityRole="button"
            testID={`chat-proposal-confirm-${proposal.id}`}
          >
            <Text style={styles.confirmText}>{t('proposal.confirm')}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.dismiss, busy && styles.disabled]}
            disabled={busy}
            onPress={() => dismiss.mutate()}
            accessibilityRole="button"
            testID={`chat-proposal-dismiss-${proposal.id}`}
          >
            <Text style={styles.dismissText}>{t('proposal.dismiss')}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.status, isProblem && styles.statusProblem]}>
          {t(`proposal.${proposal.status}`)}
          {proposal.status === 'failed' && proposal.error ? `: ${proposal.error}` : ''}
        </Text>
      )}

      {error && proposal.status === 'pending' ? (
        <Text style={[styles.status, styles.statusProblem]}>
          {getErrorMessage(error) || t('proposal.error')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      maxWidth: '80%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
      marginBottom: 12,
    },
    heading: { fontSize: 12, fontWeight: '600', color: colors.primary },
    summary: { fontSize: 15, lineHeight: 20, color: colors.text },
    actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    button: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
    confirm: { backgroundColor: colors.primary },
    confirmText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
    dismiss: { backgroundColor: colors.surfaceAlt },
    dismissText: { color: colors.text, fontSize: 14 },
    disabled: { opacity: 0.5 },
    status: { fontSize: 13, color: colors.textSubtle, marginTop: 4 },
    statusProblem: { color: colors.danger },
  });
}
