import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  useAddMockInterviewQuestions,
  useGenerateMockInterviewQuestions,
} from '../hooks/useMockInterviewQuestionMutations';
import { MOCK_QUESTION_LIMITS, type GeneratedMockQuestions } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface GenerateQuestionsModalProps {
  applicationId: string;
  roundId: string;
  /** How many more practice questions the round can take. */
  slotsLeft: number;
  onClose: () => void;
}

/**
 * Asks the AI for practice questions and lets the user choose which to keep.
 * Nothing is saved until "Add to Practice": the suggestions live only here.
 * Mount it only while open: unmounting is what discards the prompt and suggestions.
 */
export function GenerateQuestionsModal({
  applicationId,
  roundId,
  slotsLeft,
  onClose,
}: GenerateQuestionsModalProps) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const generate = useGenerateMockInterviewQuestions(roundId);
  const addQuestions = useAddMockInterviewQuestions(applicationId, roundId);

  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<GeneratedMockQuestions | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  const suggestions = result?.suggestions ?? [];
  const chosen = suggestions.filter((_, i) => selected.has(i));
  const overLimit = chosen.length > slotsLeft;
  const busy = generate.isPending || addQuestions.isPending;
  const error = generate.isError
    ? getErrorMessage(generate.error)
    : addQuestions.isError
      ? getErrorMessage(addQuestions.error)
      : null;

  const contextNote = result
    ? !result.usedJobDescription && !result.usedBriefing
      ? t('noContextNote')
      : !result.usedBriefing
        ? t('noBriefingNote')
        : !result.usedJobDescription
          ? t('noDescriptionNote')
          : null
    : null;

  const runGenerate = () =>
    generate.mutate(prompt, {
      onSuccess: (data) => {
        setResult(data);
        setSelected(new Set(data.suggestions.map((_, i) => i)));
      },
    });

  const toggle = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const canAdd = !busy && chosen.length > 0 && !overLimit;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="generate-questions-modal"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} testID="generate-cancel-button">
            <Text style={styles.linkMuted}>{result ? t('discard') : t('cancel')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('generateTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.fieldLabel}>
            {t('generatePromptLabel')} <Text style={styles.optional}>{t('responseOptional')}</Text>
          </Text>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.multiline]}
            placeholder={t('generatePromptPlaceholder')}
            value={prompt}
            onChangeText={setPrompt}
            maxLength={MOCK_QUESTION_LIMITS.PROMPT_MAX_CHARS}
            multiline
            testID="generate-prompt-input"
          />
          <Pressable
            style={[styles.generateButton, busy && styles.buttonDisabled]}
            onPress={runGenerate}
            disabled={busy}
            accessibilityRole="button"
            testID="generate-submit-button"
          >
            {generate.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.generateButtonText}>
                {result ? t('regenerate') : t('generate')}
              </Text>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {result ? (
            <View style={styles.suggestions}>
              <Text style={styles.sectionLabel}>
                {t('suggestionsHeading', { count: suggestions.length })}
              </Text>
              {contextNote ? <Text style={styles.note}>{contextNote}</Text> : null}
              {suggestions.map((suggestion, index) => {
                const isOn = selected.has(index);
                return (
                  <Pressable
                    key={`${index}-${suggestion}`}
                    style={[styles.suggestion, isOn && styles.suggestionOn]}
                    onPress={() => toggle(index)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isOn }}
                    accessibilityLabel={suggestion}
                    testID={`suggestion-${index}`}
                  >
                    <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                      {isOn ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                );
              })}
              {overLimit ? (
                <Text style={styles.error}>
                  {t('practiceLimitReached', { max: MOCK_QUESTION_LIMITS.QUESTIONS_PER_ROUND })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {result ? (
          <View style={styles.footer}>
            <Text style={styles.footerNote}>
              {t('selectedCount', { count: chosen.length })} · {t('suggestionNote')}
            </Text>
            <Pressable
              style={[styles.addButton, !canAdd && styles.buttonDisabled]}
              onPress={() => addQuestions.mutate(chosen, { onSuccess: onClose })}
              disabled={!canAdd}
              accessibilityRole="button"
              testID="add-suggestions-button"
            >
              <Text style={styles.addButtonText}>
                {addQuestions.isPending ? t('saving') : t('addSelected', { count: chosen.length })}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
    headerSpacer: { width: 48 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    body: { flex: 1 },
    bodyContent: { padding: 16, gap: 10 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    optional: { fontWeight: '400', color: colors.textFaint },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    multiline: { minHeight: 88, textAlignVertical: 'top' },
    generateButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    generateButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
    buttonDisabled: { opacity: 0.5 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    suggestions: { gap: 8, marginTop: 6 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    note: { fontSize: 12, color: colors.warning },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      minHeight: 48,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    suggestionOn: { borderColor: colors.primary, backgroundColor: colors.primarySurface },
    suggestionText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    checkmark: { color: colors.onPrimary, fontSize: 14, fontWeight: '800', lineHeight: 16 },
    footer: {
      padding: 16,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    footerNote: { fontSize: 12, color: colors.textSubtle, textAlign: 'center' },
    addButton: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    addButtonText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  });
}
