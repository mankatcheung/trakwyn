import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAiCredits } from '../hooks/useAiCredits';
import { useTheme } from '../../../theme/ThemeContext';

interface AiCreditsInlineProps {
  testID?: string;
}

/** A compact "12 of 30 left · resets 1 Dec" line. Only for a user on Trakwyn AI. */
export function AiCreditsInline({ testID = 'ai-credits-inline' }: AiCreditsInlineProps) {
  const { t } = useTranslation('ai');
  const { colors } = useTheme();
  const styles = useMemo(
    () => StyleSheet.create({ line: { fontSize: 12, color: colors.textSubtle } }),
    [colors],
  );
  const { onTrakwynAi, standing, resetsAt } = useAiCredits();
  if (!onTrakwynAi || !standing) return null;
  return (
    <Text style={styles.line} testID={testID}>
      {t('creditsLeft', {
        left: standing.left,
        total: standing.total,
        date: resetsAt ? new Date(resetsAt).toLocaleDateString() : '',
      })}
    </Text>
  );
}
