import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { aiCreditsStanding } from '../lib/aiCredits';
import { AI_SOURCES, type AiCredits, type AiSource } from '../types';
import { AiCreditsExhaustedNotice } from './AiCreditsExhaustedNotice';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AiSourceCardProps {
  aiSource: AiSource;
  aiCredits: AiCredits;
  pending: boolean;
  error: string | null;
  onChange: (source: AiSource) => void;
}

/**
 * The AI source picker (Auto / Trakwyn AI / own key) and the credits meter
 * (JEF-451). A number, not a percentage: "12 of 30 left". Always shown here;
 * the 80% line nudges, the 100% line offers Upgrade and Add your own key.
 */
export function AiSourceCard({ aiSource, aiCredits, pending, error, onChange }: AiSourceCardProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const standing = aiCreditsStanding(aiCredits);
  const resetDate = new Date(aiCredits.resetsAt).toLocaleDateString();

  return (
    <View style={styles.card} testID="ai-source-card">
      <Text style={styles.title}>{t('ai.source.title')}</Text>
      <Text style={styles.help}>{t('ai.source.help')}</Text>
      <View style={styles.options}>
        {AI_SOURCES.map((source) => {
          const selected = source === aiSource;
          return (
            <Pressable
              key={source}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => !selected && onChange(source)}
              disabled={pending}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              testID={`ai-source-option-${source}`}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {t(`ai.source.${source}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.creditsTitle}>{t('ai.credits.title')}</Text>
      <Text style={styles.creditsLeft} testID="ai-credits-left">
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
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    help: { fontSize: 13, color: colors.textSubtle },
    options: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    option: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    optionSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
    optionText: { fontSize: 14, color: colors.text },
    optionTextSelected: { color: colors.primary, fontWeight: '600' },
    error: { fontSize: 13, color: colors.danger },
    creditsTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 6 },
    creditsLeft: { fontSize: 14, color: colors.text },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
    fill: { height: 6, backgroundColor: colors.primary },
    fillWarn: { backgroundColor: colors.danger },
    warn: { fontSize: 13, color: colors.danger },
  });
}
