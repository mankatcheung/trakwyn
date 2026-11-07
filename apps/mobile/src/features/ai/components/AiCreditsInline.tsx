import React, { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAiCredits } from '../hooks/useAiCredits';
import { useTheme } from '../../../theme/ThemeContext';

interface AiCreditsInlineProps {
  testID?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * A compact "12 of 30 left · resets 1 Dec" line. Only for a user on Trakwyn AI.
 * Amber when nearing the end of the month's credits, red when none are left.
 */
export function AiCreditsInline({ testID = 'ai-credits-inline', style }: AiCreditsInlineProps) {
  const { t } = useTranslation('ai');
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        line: { fontSize: 12, color: colors.textSubtle },
        nearing: { color: colors.warning },
        exhausted: { color: colors.danger },
      }),
    [colors],
  );
  const { onTrakwynAi, standing, resetsAt } = useAiCredits();
  if (!onTrakwynAi || !standing) return null;
  return (
    <Text
      style={[
        styles.line,
        standing.exhausted ? styles.exhausted : standing.nearing ? styles.nearing : null,
        style,
      ]}
      testID={testID}
    >
      {t('creditsLeft', {
        left: standing.left,
        total: standing.total,
        date: resetsAt ? new Date(resetsAt).toLocaleDateString() : '',
      })}
    </Text>
  );
}
