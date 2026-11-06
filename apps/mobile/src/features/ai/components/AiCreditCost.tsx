import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAiCredits, type AiFeature } from '../hooks/useAiCredits';
import { useTheme } from '../../../theme/ThemeContext';

interface AiCreditCostProps {
  feature: AiFeature;
  testID?: string;
}

/** "Uses N credits". Nothing for a user on their own key, or while the cost is unknown. */
export function AiCreditCost({ feature, testID }: AiCreditCostProps) {
  const { t } = useTranslation('ai');
  const { colors } = useTheme();
  const styles = useMemo(
    () => StyleSheet.create({ cost: { fontSize: 12, color: colors.textSubtle } }),
    [colors],
  );
  const { onTrakwynAi, costOf } = useAiCredits();
  const cost = costOf(feature);
  if (!onTrakwynAi || cost === null) return null;
  return (
    <Text style={styles.cost} testID={testID ?? `ai-cost-${feature}`}>
      {t(cost === 1 ? 'costOne' : 'costMany', { count: cost })}
    </Text>
  );
}
