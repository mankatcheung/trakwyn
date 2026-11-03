import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, captureEvent } from '../../../lib/analytics';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { openPlanPage } from './AiCreditsExhaustedNotice';

/**
 * What a Free user sees in place of the source picker and the credits meter
 * (JEF-451): Trakwyn AI is Pro-only for now. Adding their own key, below,
 * is the free way to use AI.
 */
export function AiProNote() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const onUpgrade = () => {
    captureEvent(ANALYTICS_EVENTS.AI_UPGRADE_CLICKED, { surface: 'settings' });
    openPlanPage();
  };

  return (
    <View style={styles.card} testID="ai-pro-note">
      <Text style={styles.title}>{t('ai.proNote.title')}</Text>
      <Text style={styles.help}>{t('ai.proNote.help')}</Text>
      <Pressable style={styles.button} onPress={onUpgrade} testID="ai-pro-note-upgrade-button">
        <Text style={styles.buttonText}>{t('ai.credits.upgrade')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    help: { fontSize: 13, color: colors.textSubtle },
    button: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    buttonText: { color: colors.onPrimary, fontWeight: '600', fontSize: 14 },
  });
}
