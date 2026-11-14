import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Markdown } from '../../../components/Markdown';
import { useAiCredits } from '../../ai/hooks/useAiCredits';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import {
  SELECTION_AI_ACTIONS,
  SELECTION_AI_CUSTOM_MAX_CHARS,
  type SelectionAiRequest,
} from '../lib/aiActions';
import type { SelectionAiState } from '../hooks/useSelectionAi';

interface SelectionAiBarProps {
  state: SelectionAiState;
  /** Another AI request (the sheet's) is running, so none can start here. */
  disabled?: boolean;
  onRun: (request: SelectionAiRequest) => void;
  onAsk: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * The AI actions for the selected text (JEF-587), shown while text is selected
 * and until a proposal is accepted or rejected. Same credit meter, exhausted and
 * not-set-up handling as the AI helper sheet.
 */
export function SelectionAiBar({
  state,
  disabled,
  onRun,
  onAsk,
  onAccept,
  onDismiss,
}: SelectionAiBarProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { onTrakwynAi, needsSetup, standing, costOf, canAfford } = useAiCredits();
  const [prompt, setPrompt] = useState('');

  const exhausted = onTrakwynAi && !canAfford('polishDraft');
  const cost = costOf('polishDraft');

  if (state.phase === 'loading') {
    return (
      <View style={styles.bar} testID="selection-ai-loading">
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.meta}>{t('aiPolishing')}</Text>
      </View>
    );
  }

  if (state.phase === 'proposal') {
    return (
      <View style={styles.card} testID="selection-ai-proposal">
        <Text style={styles.label}>{t('aiBefore')}</Text>
        <Text style={styles.before} numberOfLines={4} testID="selection-ai-before">
          {state.range.text}
        </Text>
        <Text style={styles.label}>{t('aiAfter')}</Text>
        <ScrollView style={styles.after} nestedScrollEnabled testID="selection-ai-after">
          <Markdown content={state.markdown} />
        </ScrollView>
        <View style={styles.actions}>
          <Pressable
            style={styles.primary}
            onPress={onAccept}
            accessibilityRole="button"
            testID="selection-ai-accept"
          >
            <Text style={styles.primaryText}>{t('aiAccept')}</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={onDismiss}
            accessibilityRole="button"
            testID="selection-ai-reject"
          >
            <Text style={styles.secondaryText}>{t('aiReject')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View style={styles.card} testID="selection-ai-error">
        <Text style={styles.error}>{state.changed ? t('aiSelectionChanged') : state.message}</Text>
        <Pressable
          style={styles.secondary}
          onPress={onDismiss}
          accessibilityRole="button"
          testID="selection-ai-dismiss"
        >
          <Text style={styles.secondaryText}>{t('aiDismiss')}</Text>
        </Pressable>
      </View>
    );
  }

  if (needsSetup) {
    return (
      <View style={styles.bar} testID="selection-ai-setup">
        <Text style={styles.meta}>{t('aiSetupHelp')}</Text>
        <Pressable onPress={() => router.push('/settings/ai')} hitSlop={8}>
          <Text style={styles.link}>{t('aiSetupAction')}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.phase === 'ask') {
    const send = () => {
      if (prompt.trim() === '') return;
      onRun({ kind: 'custom', text: prompt });
      setPrompt('');
    };
    return (
      <View style={styles.card} testID="selection-ai-ask">
        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={(value) => setPrompt(value.slice(0, SELECTION_AI_CUSTOM_MAX_CHARS))}
          maxLength={SELECTION_AI_CUSTOM_MAX_CHARS}
          placeholder={t('aiAskPlaceholder')}
          placeholderTextColor={colors.textFaint}
          returnKeyType="send"
          onSubmitEditing={send}
          autoFocus
          testID="selection-ai-prompt"
        />
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.primary,
              (disabled || exhausted || prompt.trim() === '') && styles.disabled,
            ]}
            onPress={send}
            disabled={disabled || exhausted || prompt.trim() === ''}
            accessibilityRole="button"
            testID="selection-ai-send"
          >
            <Text style={styles.primaryText}>{t('aiAskSend')}</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              setPrompt('');
              onDismiss();
            }}
            accessibilityRole="button"
            testID="selection-ai-cancel"
          >
            <Text style={styles.secondaryText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="selection-ai-bar">
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.chips}>
          {SELECTION_AI_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={[styles.chip, (disabled || exhausted) && styles.disabled]}
              onPress={() => onRun({ kind: 'preset', action: action.id })}
              disabled={disabled || exhausted}
              accessibilityRole="button"
              testID={`selection-ai-${action.id}`}
            >
              <Text style={styles.chipText}>{t(action.labelKey)}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.chip, (disabled || exhausted) && styles.disabled]}
            onPress={onAsk}
            disabled={disabled || exhausted}
            accessibilityRole="button"
            testID="selection-ai-ask-open"
          >
            <Text style={styles.chipText}>{t('aiActionAsk')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {exhausted ? (
        <Text style={styles.warn} testID="selection-ai-exhausted">
          {t('aiExhausted')}{' '}
          <Text style={styles.link} onPress={() => router.push('/settings/ai')}>
            {t('aiExhaustedLink')}
          </Text>
        </Text>
      ) : onTrakwynAi && cost !== null ? (
        <Text style={styles.meta} testID="selection-ai-cost">
          {t(cost === 1 ? 'aiCostOne' : 'aiCostMany', { count: cost })}
          {standing
            ? ` · ${t('aiCreditsLeft', { left: standing.left, total: standing.total })}`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
      borderRadius: 9999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: colors.primarySurface,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    card: {
      gap: 8,
      margin: 16,
      marginBottom: 0,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
    },
    label: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    before: { fontSize: 14, color: colors.textMuted },
    after: { maxHeight: 160 },
    input: {
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    actions: { flexDirection: 'row', gap: 10 },
    primary: {
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.primary,
    },
    primaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 14 },
    secondary: {
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryText: { color: colors.text, fontWeight: '600', fontSize: 14 },
    disabled: { opacity: 0.5 },
    meta: { fontSize: 12, color: colors.textFaint },
    warn: { fontSize: 13, color: colors.danger },
    error: { fontSize: 14, color: colors.danger },
    link: { fontSize: 13, fontWeight: '600', color: colors.primary },
  });
}
