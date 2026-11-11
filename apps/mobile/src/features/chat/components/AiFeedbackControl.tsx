import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { gqlRequest } from '../../../graphql/client';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { CLEAR_AI_OUTPUT_RATING_MUTATION, RATE_AI_OUTPUT_MUTATION } from '../graphql/operations';
import { chatHistoryQueryKey } from '../hooks/useChatHistory';
import {
  AI_FEEDBACK_REASONS,
  type AiFeedbackReason,
  type AiRating,
  type ChatMessage,
} from '../types';
import { ThumbIcon } from './ThumbIcon';

interface AiFeedbackControlProps {
  /** The assistant reply being rated. */
  messageId: string;
  conversationId: string;
  /** The caller's rating as last loaded; null when there is none. */
  rating: AiRating | null;
}

/**
 * Thumbs up/down on one assistant reply (JEF-547). A thumbs down saves at once
 * and then offers a reason from a fixed list; the reason is optional, so
 * leaving it or choosing Skip keeps the down-vote. Pressing the chosen thumb
 * again takes the rating back. The change shows straight away and goes back if
 * the API refuses it. Only the id and the choice are sent, never any text.
 */
export function AiFeedbackControl({
  messageId,
  conversationId,
  rating: initial,
}: AiFeedbackControlProps) {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  // What the user just chose, shown at once. It is only good for the stored rating it was made
  // against: when the parent hands down a different one (a reload, the cache updated), that wins.
  const [chosen, setChosen] = useState<{ value: AiRating | null; base: AiRating | null } | null>(
    null,
  );
  const [askReason, setAskReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rating = chosen && chosen.base === initial ? chosen.value : initial;

  // Keeps the rating in the cached history so it is there when the list re-renders.
  const remember = (next: AiRating | null) =>
    queryClient.setQueryData<ChatMessage[]>(chatHistoryQueryKey(conversationId), (prev) =>
      prev?.map((m) => (m.id === messageId ? { ...m, myRating: next } : m)),
    );

  const apply = async (next: AiRating | null) => {
    setChosen({ value: next, base: initial });
    setError(null);
    setBusy(true);
    try {
      if (next) {
        await gqlRequest(RATE_AI_OUTPUT_MUTATION, {
          targetKind: 'CHAT_MESSAGE',
          targetId: messageId,
          rating: next.rating,
          reason: next.reason,
        });
      } else {
        await gqlRequest(CLEAR_AI_OUTPUT_RATING_MUTATION, {
          targetKind: 'CHAT_MESSAGE',
          targetId: messageId,
        });
      }
      remember(next);
    } catch (err) {
      setChosen(null);
      setAskReason(false);
      setError(getErrorMessage(err) || t('feedback.error'));
    } finally {
      setBusy(false);
    }
  };

  const press = (value: 'UP' | 'DOWN') => {
    if (rating?.rating === value) {
      setAskReason(false);
      void apply(null);
      return;
    }
    setAskReason(value === 'DOWN');
    void apply({ rating: value, reason: null });
  };

  const chooseReason = (reason: AiFeedbackReason) => {
    setAskReason(false);
    void apply({ rating: 'DOWN', reason });
  };

  const up = rating?.rating === 'UP';
  const down = rating?.rating === 'DOWN';

  return (
    <View style={styles.container} testID={`ai-feedback-${messageId}`}>
      <View style={styles.thumbs}>
        <Pressable
          style={styles.thumb}
          disabled={busy}
          onPress={() => press('UP')}
          accessibilityRole="button"
          accessibilityLabel={t('feedback.up')}
          accessibilityState={{ selected: up, disabled: busy }}
          testID={`ai-feedback-up-${messageId}`}
          hitSlop={8}
        >
          <ThumbIcon direction="up" filled={up} color={up ? colors.primary : colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.thumb}
          disabled={busy}
          onPress={() => press('DOWN')}
          accessibilityRole="button"
          accessibilityLabel={t('feedback.down')}
          accessibilityState={{ selected: down, disabled: busy }}
          testID={`ai-feedback-down-${messageId}`}
          hitSlop={8}
        >
          <ThumbIcon
            direction="down"
            filled={down}
            color={down ? colors.primary : colors.textMuted}
          />
        </Pressable>
      </View>

      {askReason && down ? (
        <View style={styles.reasons} testID={`ai-feedback-reasons-${messageId}`}>
          <Text style={styles.prompt}>{t('feedback.reasonPrompt')}</Text>
          <View style={styles.chips}>
            {AI_FEEDBACK_REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={styles.chip}
                onPress={() => chooseReason(reason)}
                accessibilityRole="button"
                testID={`ai-feedback-reason-${reason}-${messageId}`}
              >
                <Text style={styles.chipText}>{t(`feedback.reason.${reason}`)}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setAskReason(false)}
              accessibilityRole="button"
              testID={`ai-feedback-skip-${messageId}`}
            >
              <Text style={styles.skip}>{t('feedback.skip')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t('feedback.error')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { marginTop: 4, marginBottom: 8, paddingLeft: 4, gap: 6 },
    thumbs: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    thumb: { paddingVertical: 4 },
    reasons: { gap: 6 },
    prompt: { fontSize: 12, color: colors.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    chip: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipText: { fontSize: 12, color: colors.text },
    skip: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
    error: { fontSize: 12, color: colors.danger },
  });
}
