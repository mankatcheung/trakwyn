import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { SparklesIcon } from '../../applications/components/ApplicationIcons';

/** Marks an answer that began as an AI draft. It stays however the text is edited later. */
export function AiGeneratedBadge({
  label,
  testID,
}: {
  /** Defaults to "AI generated". */
  label?: string;
  testID?: string;
}) {
  const { t } = useTranslation('interviews');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.badge} testID={testID}>
      <SparklesIcon color={colors.primary} size={12} />
      <Text style={styles.text}>{label ?? t('aiGenerated')}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.primarySurface,
    },
    text: { fontSize: 12, fontWeight: '700', color: colors.primary },
  });
}
