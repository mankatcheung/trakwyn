import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useQuotaState, type QuotaResource } from '../hooks/useQuotaState';

interface QuotaHintProps {
  resource: QuotaResource;
  /** Per-application resources: how many the application holds. Omit for per-user ones. */
  used?: number;
}

/**
 * "9 of 10 notes" beside a create control (JEF-494). Silent until 80% of the
 * limit, because most users never come near a cap and an always-on counter is
 * noise; at the cap it says what the limit is and how to get room.
 */
export function QuotaHint({ resource, used }: QuotaHintProps) {
  const { t } = useTranslation('quota');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const state = useQuotaState(resource, used);
  if (!state || state.level === 'ok') return null;

  const noun = t(`noun.${resource}`);
  if (state.level === 'full') {
    return (
      <Text style={[styles.text, styles.full]} accessibilityRole="alert" testID="quota-hint-full">
        {t('full', { limit: state.limit, noun })}
      </Text>
    );
  }
  return (
    <Text style={[styles.text, styles.warning]} testID="quota-hint-warning">
      {t('usage', { used: state.used, limit: state.limit, noun })}
    </Text>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    text: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 4 },
    warning: { color: colors.warning },
    full: { color: colors.danger },
  });
}
