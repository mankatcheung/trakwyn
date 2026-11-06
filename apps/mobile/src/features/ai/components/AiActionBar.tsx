import React, { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AiCreditsExhaustedNotice } from '../../settings/components/AiCreditsExhaustedNotice';
import { useAiCredits, type AiFeature } from '../hooks/useAiCredits';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { AiCreditCost } from './AiCreditCost';
import { AiCreditsInline } from './AiCreditsInline';
import { AiPromptInput } from './AiPromptInput';

interface AiActionBarInstructions {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** False: the box is open. True: it sits behind an "Add instructions" toggle. */
  collapsible?: boolean;
  inputTestID?: string;
  toggleTestID?: string;
}

interface AiActionBarProps {
  feature: AiFeature;
  /**
   * Starts the action. Its mutation hook re-reads the credits once it settles
   * (`useRefreshAiCredits`), whatever the outcome.
   */
  onRun: () => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  /** The optional prompt; leave out for an action that takes none. */
  instructions?: AiActionBarInstructions;
  variant?: 'primary' | 'outline';
  buttonTestID?: string;
  /** Anything else that belongs between the prompt and the button. */
  children?: ReactNode;
}

/**
 * The run button of an AI action with what surrounds it: the optional prompt,
 * cost, credits left, and the two states where it cannot run: no AI set up,
 * and credits spent (JEF-509). Nothing about credits shows for a user on
 * their own key.
 */
export function AiActionBar({
  feature,
  onRun,
  label,
  loading,
  disabled,
  instructions,
  variant = 'primary',
  buttonTestID,
  children,
}: AiActionBarProps) {
  const { t } = useTranslation('ai');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { onTrakwynAi, needsSetup, canAfford } = useAiCredits();
  const [promptOpen, setPromptOpen] = useState(false);
  const exhausted = onTrakwynAi && !canAfford(feature);
  const showPrompt = instructions && (!instructions.collapsible || promptOpen);

  if (needsSetup) {
    return (
      <View style={styles.group}>
        <Text style={styles.help}>{t('setupHelp')}</Text>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/settings/ai')}
          accessibilityRole="button"
          testID="ai-setup-button"
        >
          <Text style={styles.primaryText}>{t('setupAction')}</Text>
        </Pressable>
      </View>
    );
  }

  const outline = variant === 'outline';
  return (
    <View style={styles.group}>
      {instructions?.collapsible ? (
        <Pressable
          onPress={() => setPromptOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: promptOpen }}
          testID={instructions.toggleTestID ?? 'ai-instructions-toggle'}
        >
          <Text style={styles.toggle}>
            {promptOpen ? t('hideInstructions') : t('addInstructions')}
          </Text>
        </Pressable>
      ) : null}
      {showPrompt && instructions ? (
        <AiPromptInput
          value={instructions.value}
          onChange={instructions.onChange}
          placeholder={instructions.placeholder}
          label={instructions.label}
          disabled={loading}
          testID={instructions.inputTestID}
        />
      ) : null}
      {children}
      <Pressable
        style={[
          outline ? styles.outline : styles.primary,
          (disabled || loading || exhausted) && styles.disabled,
        ]}
        onPress={onRun}
        disabled={disabled || loading || exhausted}
        accessibilityRole="button"
        testID={buttonTestID ?? 'ai-run-button'}
      >
        {loading ? (
          <ActivityIndicator color={outline ? colors.primary : colors.onPrimary} size="small" />
        ) : (
          <Text style={outline ? styles.outlineText : styles.primaryText}>{label}</Text>
        )}
      </Pressable>
      {exhausted ? (
        <AiCreditsExhaustedNotice surface="ai_action" message={t('exhausted')} />
      ) : (
        <AiCreditCost feature={feature} />
      )}
      <AiCreditsInline />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    group: { gap: 8 },
    help: { fontSize: 13, color: colors.textSubtle },
    toggle: { fontSize: 13, fontWeight: '600', color: colors.primary },
    primary: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
    outline: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primarySurface,
    },
    outlineText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.5 },
  });
}
