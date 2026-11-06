import React, { useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { createSheetStyles } from '../../../components/sheetStyles';
import { useAiCredits, type AiFeature } from '../../ai/hooks/useAiCredits';
import { AI_PROMPT_MAX_LENGTH, type PolishSuggestion } from '../hooks/useDraftAiHelper';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import type { DocumentDraftType } from '../types';
import { PolishPreview } from './PolishPreview';
import { ResumeSourcePicker, type ResumeChoice } from './ResumeSourcePicker';

const EXAMPLE_ROTATE_MS = 4000;

interface AiHelperSheetProps {
  visible: boolean;
  onClose: () => void;
  applicationId: string;
  type: DocumentDraftType;
  /** Whether the editor has text right now: Polish when it does, Generate when it is empty. */
  hasText: boolean;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  running: boolean;
  failure: string | null;
  suggestion: PolishSuggestion | null;
  /** The editor text now, to tell a suggestion that no longer fits. */
  currentText: string;
  onGenerate: (resume: ResumeChoice | null) => void | Promise<unknown>;
  onPolish: () => void;
  onReplace: () => void;
  onInsertBelow: () => void;
  onDiscard: () => void;
}

/**
 * The AI helper (JEF-508): a bottom sheet opened from the editor header. One
 * main action (Generate on an empty editor, Polish on text), Regenerate from
 * scratch behind a confirmation, and the credit cost on Trakwyn AI.
 */
export function AiHelperSheet({
  visible,
  onClose,
  applicationId,
  type,
  hasText,
  instructions,
  onInstructionsChange,
  running,
  failure,
  suggestion,
  currentText,
  onGenerate,
  onPolish,
  onReplace,
  onInsertBelow,
  onDiscard,
}: AiHelperSheetProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { onTrakwynAi, needsSetup, standing, costOf, canAfford } = useAiCredits();
  const [resume, setResume] = useState<ResumeChoice | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  const examples = useMemo(
    () =>
      (type === 'resume'
        ? ['aiResumeExample1', 'aiResumeExample2', 'aiResumeExample3']
        : ['aiLetterExample1', 'aiLetterExample2', 'aiLetterExample3']
      ).map((key) => t(key)),
    [type, t],
  );
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(
      () => setExampleIndex((i) => (i + 1) % examples.length),
      EXAMPLE_ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [visible, examples.length]);

  const feature: AiFeature = hasText ? 'polishDraft' : type === 'resume' ? 'resume' : 'coverLetter';
  const cost = costOf(feature);
  const exhausted = onTrakwynAi && !canAfford(feature);

  const goToAiSettings = () => {
    onClose();
    router.push('/settings/ai');
  };
  const runMain = () => (hasText ? onPolish() : onGenerate(resume));
  const regenerate = () => {
    setConfirmRegenerate(false);
    onGenerate(resume);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} testID="ai-helper-backdrop" />
      <KeyboardAvoidingView
        style={styles.sheetContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, styles.sheetBody]} testID="ai-helper-sheet">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('aiTitle')}</Text>
            <Text style={styles.help}>{t(hasText ? 'aiPolishHelp' : 'aiGenerateHelp')}</Text>

            {!hasText && type === 'cover_letter' ? (
              <ResumeSourcePicker
                applicationId={applicationId}
                value={resume}
                onChange={setResume}
                disabled={running}
              />
            ) : null}

            {needsSetup ? (
              <View style={styles.group}>
                <Text style={styles.help}>{t('aiSetupHelp')}</Text>
                <Pressable style={styles.primary} onPress={goToAiSettings} testID="ai-helper-setup">
                  <Text style={styles.primaryText}>{t('aiSetupAction')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.group}>
                <Text style={styles.label}>{t('aiPromptLabel')}</Text>
                <TextInput
                  style={styles.input}
                  multiline
                  value={instructions}
                  onChangeText={(value) =>
                    onInstructionsChange(value.slice(0, AI_PROMPT_MAX_LENGTH))
                  }
                  maxLength={AI_PROMPT_MAX_LENGTH}
                  editable={!running}
                  placeholder={examples[exampleIndex % examples.length]}
                  placeholderTextColor={colors.textFaint}
                  testID="ai-helper-prompt"
                />
                <Text style={styles.counter} testID="ai-helper-counter">
                  {instructions.length}/{AI_PROMPT_MAX_LENGTH}
                </Text>

                <Pressable
                  style={[styles.primary, (running || exhausted) && styles.disabled]}
                  onPress={runMain}
                  disabled={running || exhausted}
                  testID="ai-helper-run"
                >
                  {running ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={styles.primaryText}>{t(hasText ? 'aiPolish' : 'aiGenerate')}</Text>
                  )}
                </Pressable>

                {exhausted ? (
                  <Text style={styles.warn} testID="ai-helper-exhausted">
                    {t('aiExhausted')}{' '}
                    <Text
                      style={styles.link}
                      onPress={goToAiSettings}
                      testID="ai-helper-exhausted-link"
                    >
                      {t('aiExhaustedLink')}
                    </Text>
                  </Text>
                ) : onTrakwynAi && cost !== null ? (
                  <Text style={styles.meta} testID="ai-helper-cost">
                    {t(cost === 1 ? 'aiCostOne' : 'aiCostMany', { count: cost })}
                  </Text>
                ) : null}
                {onTrakwynAi && standing ? (
                  <Text style={styles.meta} testID="ai-helper-credits-left">
                    {t('aiCreditsLeft', { left: standing.left, total: standing.total })}
                  </Text>
                ) : null}
              </View>
            )}

            {failure ? (
              <Text style={styles.error} testID="ai-helper-error">
                {failure}
              </Text>
            ) : null}

            {suggestion ? (
              <PolishPreview
                markdown={suggestion.markdown}
                stale={currentText !== suggestion.sourceText}
                onReplace={onReplace}
                onInsert={onInsertBelow}
                onDiscard={onDiscard}
              />
            ) : null}

            {hasText && !needsSetup ? (
              <View style={styles.regenerate}>
                {confirmRegenerate ? (
                  <View style={styles.group} testID="ai-helper-regenerate-confirm">
                    <Text style={styles.help}>{t('aiRegenerateConfirm')}</Text>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.danger, running && styles.disabled]}
                        onPress={regenerate}
                        disabled={running}
                        testID="ai-helper-regenerate-yes"
                      >
                        <Text style={styles.primaryText}>{t('aiRegenerateYes')}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondary}
                        onPress={() => setConfirmRegenerate(false)}
                        testID="ai-helper-regenerate-cancel"
                      >
                        <Text style={styles.secondaryText}>{t('cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.secondary, running && styles.disabled]}
                    onPress={() => setConfirmRegenerate(true)}
                    disabled={running}
                    testID="ai-helper-regenerate"
                  >
                    <Text style={styles.secondaryText}>{t('aiRegenerate')}</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    ...createSheetStyles(colors),
    sheetBody: { maxHeight: '88%' },
    content: { gap: 12, paddingBottom: 8 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    help: { fontSize: 13, color: colors.textSubtle },
    group: { gap: 8 },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    label: { fontSize: 13, fontWeight: '600', color: colors.text },
    input: {
      minHeight: 84,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlignVertical: 'top',
    },
    counter: { fontSize: 12, color: colors.textFaint, textAlign: 'right' },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 15 },
    danger: {
      backgroundColor: colors.danger,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    secondary: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    secondaryText: { color: colors.text, fontWeight: '600', fontSize: 14 },
    disabled: { opacity: 0.5 },
    meta: { fontSize: 12, color: colors.textSubtle },
    warn: { fontSize: 13, color: colors.warning },
    link: { fontWeight: '700', textDecorationLine: 'underline', color: colors.warning },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    regenerate: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
  });
}
