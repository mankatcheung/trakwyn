import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { INTERVIEW_QUESTION_LIMITS } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { AiGeneratedBadge } from './AiGeneratedBadge';

interface AnswerDraftModalProps {
  question: string;
  /** The AI's draft. The screen re-keys the modal when a new one arrives. */
  initialDraft: string;
  isSaving: boolean;
  isRegenerating: boolean;
  onSave: (answer: string) => void;
  onRegenerate: () => void;
  onDiscard: () => void;
}

/**
 * An AI-drafted answer held open for review. It is only a suggestion until
 * saved; saving marks it `ai`, and that label then stays on the answer however
 * it is edited afterwards.
 */
export function AnswerDraftModal({
  question,
  initialDraft,
  isSaving,
  isRegenerating,
  onSave,
  onRegenerate,
  onDiscard,
}: AnswerDraftModalProps) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState(initialDraft);

  const busy = isSaving || isRegenerating;
  const canSave = !busy && text.trim().length > 0;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDiscard}
      testID="answer-draft-modal"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onDiscard} testID="answer-draft-discard-button">
            <Text style={styles.linkMuted}>{t('discardDraft')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('practiceAnswerLabel')}</Text>
          <Pressable
            onPress={() => onSave(text)}
            disabled={!canSave}
            testID="answer-draft-save-button"
          >
            <Text style={[styles.link, !canSave && styles.linkDisabled]}>
              {isSaving ? t('saving') : t('saveAnswer')}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.question}>{question}</Text>
          <AiGeneratedBadge label={t('aiDraft')} testID="answer-draft-badge" />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={text}
            onChangeText={setText}
            maxLength={INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
            multiline
            editable={!busy}
            testID="answer-draft-input"
          />
          <Text style={styles.counter}>
            {text.length} / {INTERVIEW_QUESTION_LIMITS.ANSWER_MAX_CHARS}
          </Text>
          <Text style={styles.review}>{t('aiDraftReview')}</Text>
          <Pressable
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            onPress={onRegenerate}
            disabled={busy}
            accessibilityRole="button"
            testID="answer-draft-regenerate-button"
          >
            <Text style={styles.secondaryButtonText}>
              {isRegenerating ? t('generating') : t('regenerate')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    linkDisabled: { color: colors.textFaint },
    body: { flex: 1 },
    bodyContent: { padding: 16, gap: 10 },
    question: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 24 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
      minHeight: 220,
      textAlignVertical: 'top',
    },
    counter: { fontSize: 12, color: colors.textFaint, alignSelf: 'flex-end' },
    review: { fontSize: 12, color: colors.textSubtle },
    secondaryButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySurface,
    },
    secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
    buttonDisabled: { opacity: 0.5 },
  });
}
