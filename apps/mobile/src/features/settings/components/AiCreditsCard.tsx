import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { aiCreditsStanding } from '../lib/aiCredits';
import type { AiCredits } from '../types';
import { AiCreditsExhaustedNotice } from './AiCreditsExhaustedNotice';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AiCreditsCardProps {
  aiCredits: AiCredits;
}

/**
 * The Trakwyn AI credits meter (JEF-451). A number, not a percentage: "12 of 30
 * left". The 80% line nudges, the 100% line offers Upgrade and Add your own key.
 * Which AI answers is the provider order card's business (JEF-503), not this one's.
 */
export function AiCreditsCard({ aiCredits }: AiCreditsCardProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const standing = aiCreditsStanding(aiCredits);
  const resetDate = new Date(aiCredits.resetsAt).toLocaleDateString();

  return (
    <View style={styles.card} testID="ai-credits-card">
      <Text style={styles.title}>{t('ai.credits.title')}</Text>
      <Text style={styles.left} testID="ai-credits-left">
        {t('ai.credits.left', { left: standing.left, total: standing.total })}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(standing.ratio * 100)}%` },
            (standing.nearing || standing.exhausted) && styles.fillWarn,
          ]}
        />
      </View>
      <Text style={styles.help}>{t('ai.credits.resets', { date: resetDate })}</Text>
      {standing.nearing ? (
        <Text style={styles.warn} testID="ai-credits-nearing">
          {t('ai.credits.nearing')}
        </Text>
      ) : null}
      {standing.exhausted ? (
        <AiCreditsExhaustedNotice
          surface="settings"
          message={t('ai.credits.exhausted', { date: resetDate })}
        />
      ) : null}
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
    title: { fontSize: 14, fontWeight: '600', color: colors.text },
    left: { fontSize: 14, color: colors.text },
    help: { fontSize: 13, color: colors.textSubtle },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
    fill: { height: 6, backgroundColor: colors.primary },
    fillWarn: { backgroundColor: colors.danger },
    warn: { fontSize: 13, color: colors.danger },
  });
}
